// AC7 — CameraModule callback contract:
// For any session, exactly one of onComplete or onError fires exactly once.
// Drives happy-path + 4 error codes (permission_denied, timeout, upload_failed,
// webview_unsupported) through the _deps injection surface so no real
// VideoPipeline / MediaPipe / fetch is constructed.

import { describe, it, expect, vi } from "vitest";
import { CameraModule, type CameraModuleDeps } from "../../src/module/camera-module";
import type { SessionError, SessionResult } from "../../src/module/types";
import { fakeRingFrame } from "../fixtures/mock-image-bitmap";

type FsmListener<T> = (arg: T) => void;

interface FakeFsm {
  beginPermission: ReturnType<typeof vi.fn>;
  permissionGranted: ReturnType<typeof vi.fn>;
  feed: ReturnType<typeof vi.fn>;
  markCaptured: ReturnType<typeof vi.fn>;
  beginUpload: ReturnType<typeof vi.fn>;
  uploadSucceeded: ReturnType<typeof vi.fn>;
  uploadFailed: ReturnType<typeof vi.fn>;
  onBlinkConfirmed: (cb: FsmListener<number>) => void;
  onTimeout: (cb: FsmListener<void>) => void;
  onCaptureReady: (cb: FsmListener<number>) => void;
  onTransition: (cb: FsmListener<{ from: string; to: string }>) => void;
  onRetryExhausted: (cb: FsmListener<void>) => void;
  getState: () => string;
  __fire: {
    blinkConfirmed: (ts: number) => void;
    timeout: () => void;
    retryExhausted: () => void;
  };
}

function makeFakeFsm(): FakeFsm {
  const blinkCbs: FsmListener<number>[] = [];
  const timeoutCbs: FsmListener<void>[] = [];
  const retryCbs: FsmListener<void>[] = [];
  return {
    beginPermission: vi.fn(),
    permissionGranted: vi.fn(),
    feed: vi.fn(),
    markCaptured: vi.fn(),
    beginUpload: vi.fn(),
    uploadSucceeded: vi.fn(),
    uploadFailed: vi.fn(),
    onBlinkConfirmed: (cb) => {
      blinkCbs.push(cb);
    },
    onTimeout: (cb) => {
      timeoutCbs.push(cb);
    },
    onCaptureReady: () => {},
    onTransition: () => {},
    onRetryExhausted: (cb) => {
      retryCbs.push(cb);
    },
    getState: () => "idle",
    __fire: {
      blinkConfirmed: (ts) => {
        for (const cb of blinkCbs) cb(ts);
      },
      timeout: () => {
        for (const cb of timeoutCbs) cb();
      },
      retryExhausted: () => {
        for (const cb of retryCbs) cb();
      },
    },
  };
}

interface FakeVideoPipeline {
  isSupported: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  onPermissionDenied: (cb: (err: DOMException) => void) => void;
  __firePermissionDenied: (err: DOMException) => void;
}

function makeFakeVideoPipeline(overrides: Partial<{
  isSupported: boolean;
  startThrows: unknown;
}> = {}): FakeVideoPipeline {
  const permCbs: ((err: DOMException) => void)[] = [];
  return {
    isSupported: vi.fn().mockReturnValue(overrides.isSupported ?? true),
    start: vi.fn().mockImplementation(async () => {
      if (overrides.startThrows !== undefined) throw overrides.startThrows;
      return {} as MediaStream;
    }),
    stop: vi.fn(),
    onPermissionDenied: (cb) => {
      permCbs.push(cb);
    },
    __firePermissionDenied: (err) => {
      for (const cb of permCbs) cb(err);
    },
  };
}

function baseDeps(overrides: {
  videoPipeline?: FakeVideoPipeline;
  fsm?: FakeFsm;
  uploadResult?: "ok" | "fail";
}): { deps: Partial<CameraModuleDeps>; fsm: FakeFsm; vp: FakeVideoPipeline } {
  const fsm = overrides.fsm ?? makeFakeFsm();
  const vp = overrides.videoPipeline ?? makeFakeVideoPipeline();
  const winnerFrame = fakeRingFrame();
  const scorer = {
    pickBest: vi.fn().mockReturnValue({
      frame: winnerFrame,
      sharpness: 0.9,
      reflectionFree: 0.95,
      alignment: 0.85,
      total: 0.88,
    }),
    lastScoreBreakdown: {
      sharpness: 0.9,
      reflectionFree: 0.95,
      alignment: 0.85,
      total: 0.88,
    },
  };
  const ringBuffer = {
    push: vi.fn(),
    snapshot: vi.fn().mockReturnValue([winnerFrame]),
    detach: vi.fn(),
    clear: vi.fn(),
    size: vi.fn().mockReturnValue(1),
  };
  const uploadResult = overrides.uploadResult ?? "ok";
  const uploader = {
    upload: vi.fn().mockResolvedValue(
      uploadResult === "ok"
        ? { ok: true, id: "fake-id", uploadedAt: 1234567890 }
        : { ok: false, error: "HTTP 500", status: 500 },
    ),
  };
  const deps: Partial<CameraModuleDeps> = {
    videoPipeline: vp as unknown as CameraModuleDeps["videoPipeline"],
    faceLandmarker: { detect: vi.fn(), close: vi.fn() } as unknown as CameraModuleDeps["faceLandmarker"],
    fsm: fsm as unknown as CameraModuleDeps["fsm"],
    ringBuffer: ringBuffer as unknown as CameraModuleDeps["ringBuffer"],
    scorer: scorer as unknown as CameraModuleDeps["scorer"],
    uploader: uploader as unknown as CameraModuleDeps["uploader"],
    encodeJpeg: vi.fn().mockResolvedValue(
      new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }),
    ) as unknown as CameraModuleDeps["encodeJpeg"],
    now: () => 1000,
  };
  return { deps, fsm, vp };
}

function makeCallbacks(): {
  onComplete: ReturnType<typeof vi.fn>;
  onError: ReturnType<typeof vi.fn>;
  captured: { result?: SessionResult; error?: SessionError };
} {
  const captured: { result?: SessionResult; error?: SessionError } = {};
  const onComplete = vi.fn((r: SessionResult) => {
    captured.result = r;
  });
  const onError = vi.fn((e: SessionError) => {
    captured.error = e;
  });
  return { onComplete, onError, captured };
}

describe("CameraModule — AC7 callback contract (mutual exclusion, exactly-once)", () => {
  it("happy path: fires onComplete exactly once with a SessionResult, never onError", async () => {
    const { deps, fsm } = baseDeps({});
    const { onComplete, onError, captured } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    // Wait a microtask for the async start() to resolve, then trigger blink.
    await Promise.resolve();
    await Promise.resolve();
    fsm.__fire.blinkConfirmed(500);
    await handle.done;

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(0);
    expect(captured.result?.status).toBe("success");
    expect(captured.result?.serverResponse.ok).toBe(true);
  });

  it("permission denied: fires onError('permission_denied') exactly once, never onComplete", async () => {
    const denial = new DOMException("Permission denied", "NotAllowedError");
    const vp = makeFakeVideoPipeline({ startThrows: denial });
    const { deps } = baseDeps({ videoPipeline: vp });
    const { onComplete, onError, captured } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    await handle.done;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(0);
    expect(captured.error?.code).toBe("permission_denied");
  });

  it("timeout: fires onError('timeout') exactly once", async () => {
    const { deps, fsm } = baseDeps({});
    const { onComplete, onError, captured } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    fsm.__fire.timeout();
    await handle.done;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(0);
    expect(captured.error?.code).toBe("timeout");
  });

  it("upload failed: fires onError('upload_failed') exactly once", async () => {
    const { deps, fsm } = baseDeps({ uploadResult: "fail" });
    const { onComplete, onError, captured } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    fsm.__fire.blinkConfirmed(500);
    await handle.done;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(0);
    expect(captured.error?.code).toBe("upload_failed");
  });

  it("webview_unsupported: fires onError('webview_unsupported') exactly once before start() is called", async () => {
    const vp = makeFakeVideoPipeline({ isSupported: false });
    const { deps } = baseDeps({ videoPipeline: vp });
    const { onComplete, onError, captured } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    await handle.done;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(0);
    expect(captured.error?.code).toBe("webview_unsupported");
    expect(vp.start).not.toHaveBeenCalled();
  });

  it("mutual exclusion: firing blink after a timeout does not also emit onComplete", async () => {
    const { deps, fsm } = baseDeps({});
    const { onComplete, onError } = makeCallbacks();
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete,
      onError,
      _deps: deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    fsm.__fire.timeout();
    // Late blink — must be ignored.
    fsm.__fire.blinkConfirmed(500);
    await handle.done;

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onComplete).toHaveBeenCalledTimes(0);
  });
});
