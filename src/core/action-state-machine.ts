// Phase 4 — front-align → blink action state machine.
//
// Inputs: a stream of `FrameMetrics` samples (via `feed()`) from the
// FaceLandmarkerRunner plus session-level events (start, retry, fallback,
// upload outcomes).
// Outputs: state transition events consumed by the UI overlay and the
// CameraModule orchestrator.
//
// States:
//   idle → permission → preview → aligning → align_hold (1000ms)
//        → blink_prompt → blink_detecting → blink_confirmed
//        → captured → uploading → done
//   timeout, retry, failed, manual_fallback
//
// Invalidation back-edges (Major #3):
//   * ALIGN_HOLD: alignment break OR face lost ≥ faceLostFrameThreshold
//       → ALIGNING (reset hold timer).
//   * BLINK_PROMPT: alignment break OR face lost
//       → ALIGNING (clearEarBuffer).
//   * BLINK_DETECTING: alignment break OR face lost ≥ faceLostFrameThreshold
//       → ALIGNING (clearEarBuffer). This is the critical rule that prevents
//       a head tilt from registering as a false blink when eyelids are
//       occluded by the camera-relative pitch/yaw.
//
// The FSM owns no timers of its own beyond the align-hold deadline and the
// session timeout, and it exposes `clearEarBuffer()` so higher-order logic
// (or tests) can synchronize their own blink buffer with the invalidation
// back-edges.

import type { FrameMetrics } from "./face-landmarker-runner";
import {
  evaluateAlignment,
  isFaceLost,
  type AlignmentGate,
} from "./metrics/alignment";
import { isBlink } from "./metrics/ear";

export type ActionState =
  | "idle"
  | "permission"
  | "preview"
  | "aligning"
  | "align_hold"
  | "blink_prompt"
  | "blink_detecting"
  | "blink_confirmed"
  | "captured"
  | "uploading"
  | "done"
  | "timeout"
  | "retry"
  | "failed"
  | "manual_fallback";

export interface ActionEvent {
  from: ActionState;
  to: ActionState;
  at: number;
  reason?: string;
}

export interface ActionStateMachineConfig {
  alignHoldMs: number;
  sessionTimeoutMs: number;
  maxRetries: number;
  maxBlinkRetriesBeforeFallback: number;
  faceLostFrameThreshold: number;
  alignment: AlignmentGate;
  earBlinkClosedMax: number;
  earBlinkOpenMin: number;
  earWindowMs: number;
  earRollingWindow: number;
  earMinClosedFrames: number;
}

const DEFAULT_CONFIG: ActionStateMachineConfig = {
  alignHoldMs: 1000,
  sessionTimeoutMs: 15000,
  maxRetries: 3,
  maxBlinkRetriesBeforeFallback: 2,
  faceLostFrameThreshold: 2,
  alignment: { yawMaxDeg: 12, pitchMaxDeg: 12, rollMaxDeg: 12 },
  earBlinkClosedMax: 0.18,
  earBlinkOpenMin: 0.24,
  earWindowMs: 600,
  earRollingWindow: 12,
  earMinClosedFrames: 2,
};

type Listener<T> = (payload: T) => void;

export class ActionStateMachine {
  private state: ActionState = "idle";
  private readonly cfg: ActionStateMachineConfig;

  private alignHoldStartedAt: number | null = null;
  private sessionStartedAt: number | null = null;
  private faceLostStreak = 0;
  private retryCount = 0;
  private earBuffer: number[] = [];

  private transitionListeners: Listener<ActionEvent>[] = [];
  private blinkConfirmedListeners: Listener<number>[] = [];
  private timeoutListeners: Listener<void>[] = [];
  private fallbackListeners: Listener<void>[] = [];
  private captureReadyListeners: Listener<number>[] = [];
  private retryExhaustedListeners: Listener<void>[] = [];

  constructor(cfg: Partial<ActionStateMachineConfig> = {}) {
    this.cfg = {
      ...DEFAULT_CONFIG,
      ...cfg,
      alignment: { ...DEFAULT_CONFIG.alignment, ...cfg.alignment },
    };
  }

  getState(): ActionState {
    return this.state;
  }

  reset(): void {
    this.transition("idle", "reset");
    this.alignHoldStartedAt = null;
    this.sessionStartedAt = null;
    this.faceLostStreak = 0;
    this.retryCount = 0;
    this.earBuffer = [];
  }

  clearEarBuffer(): void {
    this.earBuffer = [];
  }

  // Session lifecycle events --------------------------------------------------

  beginPermission(now: number = Date.now()): void {
    this.sessionStartedAt = now;
    this.transition("permission", "begin");
  }

  permissionGranted(): void {
    this.transition("preview", "permission_granted");
    this.transition("aligning", "preview_ready");
  }

  markCaptured(now: number): void {
    if (this.state !== "blink_confirmed") return;
    this.transition("captured", "capture_taken");
    this.emit(this.captureReadyListeners, now);
  }

  beginUpload(): void {
    if (this.state !== "captured") return;
    this.transition("uploading", "upload_start");
  }

  uploadSucceeded(): void {
    if (this.state !== "uploading") return;
    this.transition("done", "upload_success");
  }

  uploadFailed(): void {
    if (this.state !== "uploading") return;
    this.handleRetryOrFail("upload_failed");
  }

  triggerManualFallback(): void {
    this.transition("manual_fallback", "user_fallback");
    this.emit(this.fallbackListeners, undefined);
  }

  // Frame ingress -------------------------------------------------------------

  feed(metrics: FrameMetrics): void {
    if (this.sessionStartedAt !== null && this.isActiveState()) {
      if (metrics.timestamp - this.sessionStartedAt > this.cfg.sessionTimeoutMs) {
        this.handleTimeout();
        return;
      }
    }

    switch (this.state) {
      case "aligning":
        this.handleAligning(metrics);
        return;
      case "align_hold":
        this.handleAlignHold(metrics);
        return;
      case "blink_prompt":
        this.handleBlinkPrompt(metrics);
        return;
      case "blink_detecting":
        this.handleBlinkDetecting(metrics);
        return;
      default:
        return;
    }
  }

  // Alignment / blink transition handlers ------------------------------------

  private handleAligning(metrics: FrameMetrics): void {
    const result = evaluateAlignment(metrics, this.cfg.alignment);
    if (!result.aligned) {
      this.updateFaceLostStreak(metrics);
      return;
    }
    this.faceLostStreak = 0;
    this.alignHoldStartedAt = metrics.timestamp;
    this.transition("align_hold", "alignment_ok");
  }

  private handleAlignHold(metrics: FrameMetrics): void {
    if (this.isInvalidatingFrame(metrics)) {
      this.alignHoldStartedAt = null;
      this.transition("aligning", "align_hold_invalidated");
      this.clearEarBuffer();
      return;
    }
    // faceLostStreak reset is handled inside isInvalidatingFrame() on healthy
    // frames. Resetting unconditionally here would mask a sub-threshold
    // face-lost streak (e.g. frame 1 of 2 when faceLostFrameThreshold=2).
    if (this.alignHoldStartedAt === null) {
      this.alignHoldStartedAt = metrics.timestamp;
      return;
    }
    if (metrics.timestamp - this.alignHoldStartedAt >= this.cfg.alignHoldMs) {
      this.transition("blink_prompt", "align_hold_complete");
      this.clearEarBuffer();
      this.transition("blink_detecting", "blink_prompt_shown");
    }
  }

  private handleBlinkPrompt(metrics: FrameMetrics): void {
    if (this.isInvalidatingFrame(metrics)) {
      this.transition("aligning", "blink_prompt_invalidated");
      this.clearEarBuffer();
    }
  }

  private handleBlinkDetecting(metrics: FrameMetrics): void {
    if (this.isInvalidatingFrame(metrics)) {
      this.transition("aligning", "blink_detect_invalidated");
      this.clearEarBuffer();
      return;
    }
    // See handleAlignHold: streak reset belongs inside isInvalidatingFrame,
    // not here. An unconditional reset would prevent two consecutive null
    // frames from ever reaching the default faceLostFrameThreshold=2.
    if (metrics.ear !== null) {
      this.earBuffer.push(metrics.ear);
      if (this.earBuffer.length > this.cfg.earRollingWindow) {
        this.earBuffer.splice(0, this.earBuffer.length - this.cfg.earRollingWindow);
      }
    }

    const blinked = isBlink(this.earBuffer, {
      closedMax: this.cfg.earBlinkClosedMax,
      openMin: this.cfg.earBlinkOpenMin,
      minClosedFrames: this.cfg.earMinClosedFrames,
      windowSize: this.cfg.earRollingWindow,
    });
    if (blinked) {
      this.transition("blink_confirmed", "blink_detected");
      this.emit(this.blinkConfirmedListeners, metrics.timestamp);
    }
  }

  // Shared predicates ---------------------------------------------------------

  private isInvalidatingFrame(metrics: FrameMetrics): boolean {
    if (isFaceLost(metrics)) {
      this.faceLostStreak += 1;
      return this.faceLostStreak >= this.cfg.faceLostFrameThreshold;
    }
    const aligned = evaluateAlignment(metrics, this.cfg.alignment).aligned;
    if (!aligned) {
      return true;
    }
    this.faceLostStreak = 0;
    return false;
  }

  private updateFaceLostStreak(metrics: FrameMetrics): void {
    if (isFaceLost(metrics)) {
      this.faceLostStreak += 1;
    } else {
      this.faceLostStreak = 0;
    }
  }

  private isActiveState(): boolean {
    switch (this.state) {
      case "idle":
      case "done":
      case "failed":
      case "timeout":
      case "manual_fallback":
        return false;
      default:
        return true;
    }
  }

  private handleTimeout(): void {
    this.transition("timeout", "session_timeout");
    this.emit(this.timeoutListeners, undefined);
    this.handleRetryOrFail("timeout");
  }

  private handleRetryOrFail(reason: string): void {
    this.retryCount += 1;
    if (this.retryCount > this.cfg.maxRetries) {
      this.transition("failed", reason);
      this.emit(this.retryExhaustedListeners, undefined);
      return;
    }
    this.transition("retry", reason);
    this.alignHoldStartedAt = null;
    this.faceLostStreak = 0;
    this.clearEarBuffer();
    this.transition("aligning", "retry_resume");
  }

  // Listener plumbing ---------------------------------------------------------

  onTransition(cb: Listener<ActionEvent>): void {
    this.transitionListeners.push(cb);
  }
  onBlinkConfirmed(cb: Listener<number>): void {
    this.blinkConfirmedListeners.push(cb);
  }
  onTimeout(cb: Listener<void>): void {
    this.timeoutListeners.push(cb);
  }
  onFallbackRequested(cb: Listener<void>): void {
    this.fallbackListeners.push(cb);
  }
  onCaptureReady(cb: Listener<number>): void {
    this.captureReadyListeners.push(cb);
  }
  onRetryExhausted(cb: Listener<void>): void {
    this.retryExhaustedListeners.push(cb);
  }

  // Internals -----------------------------------------------------------------

  private transition(to: ActionState, reason?: string): void {
    if (this.state === to) return;
    const event: ActionEvent = {
      from: this.state,
      to,
      at: Date.now(),
      reason,
    };
    this.state = to;
    this.emit(this.transitionListeners, event);
  }

  private emit<T>(listeners: Listener<T>[], payload: T): void {
    for (const cb of listeners) {
      try {
        cb(payload);
      } catch {
        // listeners are best-effort; exceptions must not poison the FSM.
      }
    }
  }
}
