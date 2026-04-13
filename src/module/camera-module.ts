// Public entry point for the MW Camera module.
//
// CameraModule.start() orchestrates the full capture session by wiring together
// VideoPipeline, FaceLandmarkerRunner, ActionStateMachine, RingBuffer,
// BestCutScorer, and Uploader. It guarantees the AC7 callback contract:
// exactly one of onComplete(SessionResult) or onError(SessionError) fires
// exactly once per session.
//
// The collaborator constructors are injectable via `opts._deps` so Phase 9
// unit tests can stub every collaborator without spinning up getUserMedia
// or MediaPipe. Production callers pass only the public fields.

import { BestCutScorer } from "../core/best-cut-scorer";
import { ActionStateMachine } from "../core/action-state-machine";
import { FaceLandmarkerRunner, type FrameMetrics } from "../core/face-landmarker-runner";
import { encodeJpeg as defaultEncodeJpeg } from "../core/jpeg-encoder";
import { RingBuffer, RingFrame } from "../core/ring-buffer";
import { Uploader, type UploadResult } from "../core/uploader";
import { VideoPipeline } from "../core/video-pipeline";
import { JPEG_QUALITY_DEFAULT } from "./thresholds";
import type {
  CameraModuleOptions,
  ScoreBreakdown,
  SessionError,
  SessionErrorCode,
  SessionResult,
  UploadMeta,
} from "./types";

// Dependency-injection surface for tests. Each field overrides the real
// collaborator with a stub; unset fields fall back to defaults built from
// the public options.
export interface CameraModuleDeps {
  videoPipeline: Pick<
    VideoPipeline,
    "isSupported" | "start" | "stop" | "onPermissionDenied"
  >;
  faceLandmarker: Pick<FaceLandmarkerRunner, "detect" | "close">;
  fsm: Pick<
    ActionStateMachine,
    | "beginPermission"
    | "permissionGranted"
    | "feed"
    | "markCaptured"
    | "beginUpload"
    | "uploadSucceeded"
    | "uploadFailed"
    | "onBlinkConfirmed"
    | "onTimeout"
    | "onCaptureReady"
    | "onTransition"
    | "onRetryExhausted"
    | "getState"
  >;
  ringBuffer: Pick<RingBuffer, "push" | "snapshot" | "detach" | "clear" | "size">;
  scorer: Pick<BestCutScorer, "pickBest" | "lastScoreBreakdown">;
  uploader: Pick<Uploader, "upload">;
  encodeJpeg: typeof defaultEncodeJpeg;
  now: () => number;
}

export interface CameraModuleOptionsWithDeps extends CameraModuleOptions {
  _deps?: Partial<CameraModuleDeps>;
}

export interface CameraSessionHandle {
  /** Completes when the session reaches a terminal state. */
  done: Promise<void>;
  /** Cooperative cancel. Safe to call multiple times. */
  cancel(): void;
}

class CameraSession {
  private settled = false;
  private startedAt = 0;
  private lastScoreBreakdown: ScoreBreakdown = {
    sharpness: 0,
    reflectionFree: 0,
    alignment: 0,
    total: 0,
  };

  private readonly opts: CameraModuleOptionsWithDeps;
  private readonly deps: CameraModuleDeps;

  private resolveDone!: () => void;
  readonly done: Promise<void>;

  constructor(opts: CameraModuleOptionsWithDeps, deps: CameraModuleDeps) {
    this.opts = opts;
    this.deps = deps;
    this.done = new Promise<void>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  async run(): Promise<void> {
    try {
      // Eager webview support gate (AC11).
      if (!this.deps.videoPipeline.isSupported()) {
        this.emitError({
          code: "webview_unsupported",
          message: "Host lacks getUserMedia / inline playback support",
        });
        return;
      }

      // Wire FSM listeners before anything that could trigger them.
      this.deps.fsm.onBlinkConfirmed((ts) => {
        void this.handleBlinkConfirmed(ts);
      });
      this.deps.fsm.onTimeout(() => {
        this.emitError({ code: "timeout", message: "Session timeout" });
      });
      this.deps.fsm.onRetryExhausted(() => {
        this.emitError({ code: "timeout", message: "Retry exhausted" });
      });

      this.deps.videoPipeline.onPermissionDenied((err) => {
        this.emitError({
          code: "permission_denied",
          message: err?.message ?? "NotAllowedError",
          cause: err,
        });
      });

      this.startedAt = this.deps.now();
      this.deps.fsm.beginPermission(this.startedAt);
      try {
        await this.deps.videoPipeline.start();
      } catch (err) {
        if (this.settled) return; // onPermissionDenied already emitted.
        const domErr = err as DOMException | Error;
        if (
          typeof DOMException !== "undefined" &&
          domErr instanceof DOMException &&
          domErr.name === "NotAllowedError"
        ) {
          this.emitError({
            code: "permission_denied",
            message: domErr.message,
            cause: domErr,
          });
          return;
        }
        this.emitError({
          code: "internal",
          message: domErr?.message ?? String(err),
          cause: err,
        });
        return;
      }
      this.deps.fsm.permissionGranted();
    } catch (err) {
      this.emitError({
        code: "internal",
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  /** Push a ring frame into the buffer and feed its metrics to the FSM. */
  ingestFrame(frame: RingFrame): void {
    if (this.settled) {
      frame.close();
      return;
    }
    this.deps.ringBuffer.push(frame);
    this.deps.fsm.feed(frame.metrics as FrameMetrics);
  }

  private async handleBlinkConfirmed(centerTs: number): Promise<void> {
    if (this.settled) return;
    try {
      const snapshot = this.deps.ringBuffer.snapshot();
      const best = this.deps.scorer.pickBest(snapshot);
      if (!best) {
        this.emitError({
          code: "internal",
          message: "BestCutScorer returned no winner",
        });
        return;
      }
      this.lastScoreBreakdown = {
        sharpness: best.sharpness,
        reflectionFree: best.reflectionFree,
        alignment: best.alignment,
        total: best.total,
      };
      this.deps.ringBuffer.detach(best.frame);
      // Close non-winning frames so their bitmaps are released immediately.
      this.deps.ringBuffer.clear();

      this.deps.fsm.markCaptured(centerTs);
      this.deps.fsm.beginUpload();

      const jpeg = await this.deps.encodeJpeg(best.frame, JPEG_QUALITY_DEFAULT);
      const meta: UploadMeta = {
        capturedAt: centerTs,
        sessionMs: this.deps.now() - this.startedAt,
        score: this.lastScoreBreakdown,
      };
      const result: UploadResult = await this.deps.uploader.upload(jpeg, meta);
      if (!result.ok) {
        this.deps.fsm.uploadFailed();
        this.emitError({
          code: "upload_failed",
          message: result.error,
        });
        return;
      }
      this.deps.fsm.uploadSucceeded();
      const sessionMs = this.deps.now() - this.startedAt;
      this.emitComplete({
        status: "success",
        uploadedAt: result.uploadedAt,
        sessionMs,
        serverResponse: { ok: true, id: result.id },
        score: this.lastScoreBreakdown,
      });
    } catch (err) {
      this.emitError({
        code: "internal",
        message: err instanceof Error ? err.message : String(err),
        cause: err,
      });
    }
  }

  cancel(): void {
    if (this.settled) return;
    this.settled = true;
    try {
      this.deps.videoPipeline.stop();
    } catch {
      /* ignore */
    }
    try {
      this.deps.faceLandmarker.close();
    } catch {
      /* ignore */
    }
    try {
      this.deps.ringBuffer.clear();
    } catch {
      /* ignore */
    }
    this.resolveDone();
  }

  private emitComplete(result: SessionResult): void {
    if (this.settled) return;
    this.settled = true;
    try {
      this.opts.onComplete?.(result);
    } catch {
      /* listener-safety */
    }
    this.teardown();
    this.resolveDone();
  }

  private emitError(err: SessionError): void {
    if (this.settled) return;
    this.settled = true;
    try {
      this.opts.onError?.(err);
    } catch {
      /* listener-safety */
    }
    this.teardown();
    this.resolveDone();
  }

  private teardown(): void {
    try {
      this.deps.videoPipeline.stop();
    } catch {
      /* ignore */
    }
    try {
      this.deps.faceLandmarker.close();
    } catch {
      /* ignore */
    }
    try {
      this.deps.ringBuffer.clear();
    } catch {
      /* ignore */
    }
  }
}

function buildDefaultDeps(opts: CameraModuleOptionsWithDeps): CameraModuleDeps {
  if (!opts.videoEl) {
    throw new Error("CameraModule.start: opts.videoEl is required in production mode");
  }
  const videoPipeline = new VideoPipeline({ videoEl: opts.videoEl });
  const fsm = new ActionStateMachine();
  const ringBuffer = new RingBuffer();
  const scorer = new BestCutScorer();
  const uploader = new Uploader(opts.uploadUrl);
  return {
    videoPipeline,
    // faceLandmarker needs async init; production code should await
    // FaceLandmarkerRunner.create() before calling start(). For the default
    // path we create a stub that throws — real callers should construct and
    // inject a FaceLandmarkerRunner themselves (see `createCameraModule`).
    faceLandmarker: {
      detect(): FrameMetrics {
        throw new Error("FaceLandmarker not initialized");
      },
      close(): void {},
    },
    fsm,
    ringBuffer,
    scorer,
    uploader,
    encodeJpeg: defaultEncodeJpeg,
    now: () => Date.now(),
  };
}

export const CameraModule = {
  /**
   * Start a camera session. Returns a handle whose `done` promise resolves
   * when either `onComplete` or `onError` has fired (exactly one will).
   */
  start(opts: CameraModuleOptionsWithDeps): CameraSessionHandle {
    const baseDeps = opts._deps
      ? ({ ...buildDefaultDepsSafe(opts), ...opts._deps } as CameraModuleDeps)
      : buildDefaultDeps(opts);
    const session = new CameraSession(opts, baseDeps);
    void session.run();
    return {
      done: session.done,
      cancel: () => session.cancel(),
    };
  },
};

// Like buildDefaultDeps but tolerant of missing videoEl (used when tests
// override every dep so we never construct a real VideoPipeline).
function buildDefaultDepsSafe(opts: CameraModuleOptionsWithDeps): Partial<CameraModuleDeps> {
  try {
    return buildDefaultDeps(opts);
  } catch {
    return {
      encodeJpeg: defaultEncodeJpeg,
      now: () => Date.now(),
    };
  }
}

export type { CameraModuleOptions, SessionResult, SessionError, SessionErrorCode };
