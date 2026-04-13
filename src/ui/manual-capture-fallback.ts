// manual-capture-fallback.ts — Phase 8 장차법 핵심 준수 경로.
//
// Provides a tap-to-capture fallback when the auto-blink path is unavailable
// or unreasonable for the user. The fallback flips the existing
// `#face_auto_capture` button into manual mode and reuses the Phase 5/6
// pipeline (BestCutScorer + JpegEncoder + Uploader) so invariant I-5 — the
// scored frame IS the uploaded frame — is preserved.
//
// Entry conditions (Phase 8):
//   1. Blink retry exhaustion. The FSM emits `onRetryExhausted` after the
//      configured `maxRetries` cap is hit; the wiring counts blink-related
//      timeouts and auto-fires the fallback once
//      `maxBlinkRetriesBeforeFallback` (default 2) is reached.
//   2. `prefers-reduced-motion: reduce`. Motion-sensitive users get the
//      manual flow from the very first frame.
//   3. Explicit user trigger — e.g. a "자동촬영 대신 수동 촬영" link or a 5s
//      idle prompt routed through `enterManualFallback()`.
//
// In MANUAL_FALLBACK the button stays bound to the same handler that the
// happy path uses; only its `aria-pressed` and Korean copy switch.

import type {
  ActionStateMachine,
  ActionEvent,
} from "../core/action-state-machine";
import type { UIControllerHandle } from "./ui-controller";

// onCapture is the actual Phase 5/6 entry point: takes the live <video>,
// fills the RingBuffer, runs BestCutScorer.pickBest(), encodes JPEG and
// uploads. The fallback module has no opinion on its internals — it only
// promises to call it exactly once per user tap.
export interface ManualCaptureFallbackOptions {
  fsm: ActionStateMachine;
  ui: UIControllerHandle;
  videoEl: HTMLVideoElement;
  onCapture: (video: HTMLVideoElement) => Promise<void> | void;
  // How many blink-related retries to tolerate before auto-firing fallback
  // (default 2 — matches plan Phase 4/8 default and Major #7).
  maxBlinkRetriesBeforeFallback?: number;
  // Optional explicit-trigger button (e.g. a "수동 촬영" link rendered
  // outside the camera DOM). Wire its click event to enterManualFallback().
  manualTriggerEl?: HTMLElement | null;
  // Idle prompt timeout (ms). After this much time without progress past
  // ALIGNING the user gets a "수동 촬영" prompt. 0 disables the timer.
  idleTriggerMs?: number;
}

export interface ManualCaptureFallbackHandle {
  isActive(): boolean;
  enterManualFallback(reason?: string): void;
  destroy(): void;
}

export function setupManualCaptureFallback(
  opts: ManualCaptureFallbackOptions,
): ManualCaptureFallbackHandle {
  const {
    fsm,
    ui,
    videoEl,
    onCapture,
    maxBlinkRetriesBeforeFallback = 2,
    manualTriggerEl = null,
    idleTriggerMs = 0,
  } = opts;

  let active = false;
  let blinkRetryCount = 0;
  let busy = false;
  let idleTimer: ReturnType<typeof setTimeout> | null = null;

  // Phase 8 entry condition #2: prefers-reduced-motion → manual mode at
  // session start. We check at setup time so screen-reader / vestibular
  // users never see the auto-blink prompt.
  const reducedMotion =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reducedMotion) {
    queueMicrotask(() => enterManualFallback("prefers_reduced_motion"));
  }

  // Phase 8 entry condition #1: count blink-related timeouts.
  // The FSM emits `onTimeout` whenever the 15s session deadline lapses or
  // a retry path bottoms out. We treat any timeout that happens while the
  // FSM was in a blink-related state as a "blink retry attempt".
  let lastBlinkPathState = false;
  const handleTransition = (e: ActionEvent) => {
    if (
      e.from === "blink_prompt" ||
      e.from === "blink_detecting" ||
      e.from === "blink_confirmed"
    ) {
      lastBlinkPathState = true;
    } else if (e.to === "aligning" && e.reason?.includes("retry")) {
      // a retry resume from a blink invalidation counts toward the retry tally
      if (lastBlinkPathState) {
        blinkRetryCount += 1;
        lastBlinkPathState = false;
        if (blinkRetryCount >= maxBlinkRetriesBeforeFallback) {
          enterManualFallback("blink_retry_exhausted");
        }
      }
    }
    if (e.to === "manual_fallback") {
      // FSM transitioned itself; mirror UI state.
      activate("fsm_event");
    }
    if (e.to === "aligning" && active === false) {
      armIdleTimer();
    }
  };

  fsm.onTransition(handleTransition);
  fsm.onFallbackRequested(() => activate("fsm_callback"));
  fsm.onRetryExhausted(() => enterManualFallback("retry_exhausted"));

  // Phase 8 entry condition #3: explicit user trigger.
  const handleManualTrigger = (ev: Event) => {
    ev.preventDefault();
    enterManualFallback("user_explicit");
  };
  manualTriggerEl?.addEventListener("click", handleManualTrigger);

  // Bind tap-to-capture on the existing #face_auto_capture button. We must
  // not double-bind on top of UIController's existing handler; instead, we
  // ask UIController to re-route via setManualMode() and consume the tap
  // here. To do that we capture button clicks at the document level when
  // active, and short-circuit the auto path.
  const captureBtn = document.getElementById("face_auto_capture");
  const handleCaptureTap = async (ev: Event) => {
    if (!active) return;
    ev.preventDefault();
    if (busy) return;
    busy = true;
    try {
      await onCapture(videoEl);
    } finally {
      busy = false;
    }
  };
  captureBtn?.addEventListener("click", handleCaptureTap);
  captureBtn?.addEventListener("keydown", (ev) => {
    if (!(ev instanceof KeyboardEvent)) return;
    if (ev.key === "Enter" || ev.key === " ") {
      void handleCaptureTap(ev);
    }
  });

  function armIdleTimer(): void {
    if (idleTriggerMs <= 0) return;
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!active) enterManualFallback("idle_prompt");
    }, idleTriggerMs);
  }

  function activate(reason: string): void {
    if (active) return;
    active = true;
    ui.setManualMode(true);
    ui.setState("MANUAL_FALLBACK");
    if (idleTimer !== null) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    // Move focus to the capture button so screen-reader users can tap it
    // immediately. We schedule the focus call after the next paint to let
    // the aria-live announcement of the help text reach AT first.
    setTimeout(() => {
      try {
        (captureBtn as HTMLButtonElement | null)?.focus();
      } catch {
        /* focus is best-effort */
      }
    }, 50);
    // Tag the button for tests / 장차법 audit logs.
    captureBtn?.setAttribute("data-fallback-reason", reason);
  }

  function enterManualFallback(reason?: string): void {
    if (active) return;
    if (fsm.getState() !== "manual_fallback") {
      fsm.triggerManualFallback();
    }
    activate(reason ?? "explicit");
  }

  if (idleTriggerMs > 0) armIdleTimer();

  return {
    isActive: () => active,
    enterManualFallback,
    destroy() {
      if (idleTimer !== null) clearTimeout(idleTimer);
      manualTriggerEl?.removeEventListener("click", handleManualTrigger);
      captureBtn?.removeEventListener("click", handleCaptureTap);
    },
  };
}
