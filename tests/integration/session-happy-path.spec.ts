// Integration: full CameraModule happy-path using fake dependencies.
// This exercises ingestFrame-less flow by triggering the FSM blink callback
// directly after a simulated stream is "started". Verifies upload receives
// a real Blob and the server response is surfaced through onComplete.

import { describe, it, expect, vi } from "vitest";
import { CameraModule, type CameraModuleDeps } from "../../src/module/camera-module";
import type { SessionResult } from "../../src/module/types";
import { fakeRingFrame } from "../fixtures/mock-image-bitmap";

function makeFsm() {
  const blinkCbs: Array<(ts: number) => void> = [];
  return {
    fsm: {
      beginPermission: vi.fn(),
      permissionGranted: vi.fn(),
      feed: vi.fn(),
      markCaptured: vi.fn(),
      beginUpload: vi.fn(),
      uploadSucceeded: vi.fn(),
      uploadFailed: vi.fn(),
      onBlinkConfirmed: (cb: (ts: number) => void) => {
        blinkCbs.push(cb);
      },
      onTimeout: () => {},
      onCaptureReady: () => {},
      onTransition: () => {},
      onRetryExhausted: () => {},
      getState: () => "idle",
    },
    fireBlink: (ts: number) => {
      for (const cb of blinkCbs) cb(ts);
    },
  };
}

describe("Integration — session happy path", () => {
  it("runs end-to-end and produces a SessionResult with score + serverResponse", async () => {
    const { fsm, fireBlink } = makeFsm();
    const winner = fakeRingFrame({ width: 720, height: 1280 });
    // Simulate 20 ring-buffer frames by returning the winner repeatedly.
    const snapshot = Array.from({ length: 20 }, () =>
      fakeRingFrame({ width: 720, height: 1280 }),
    );
    snapshot[10] = winner;

    const uploadedBlobs: Blob[] = [];

    const deps: Partial<CameraModuleDeps> = {
      videoPipeline: {
        isSupported: () => true,
        start: async () => ({}) as MediaStream,
        stop: () => {},
        onPermissionDenied: () => {},
      } as unknown as CameraModuleDeps["videoPipeline"],
      faceLandmarker: {
        detect: vi.fn(),
        close: vi.fn(),
      } as unknown as CameraModuleDeps["faceLandmarker"],
      fsm: fsm as unknown as CameraModuleDeps["fsm"],
      ringBuffer: {
        push: vi.fn(),
        snapshot: vi.fn().mockReturnValue(snapshot),
        detach: vi.fn(),
        clear: vi.fn(),
        size: vi.fn().mockReturnValue(snapshot.length),
      } as unknown as CameraModuleDeps["ringBuffer"],
      scorer: {
        pickBest: vi.fn().mockReturnValue({
          frame: winner,
          sharpness: 0.92,
          reflectionFree: 0.97,
          alignment: 0.88,
          total: 0.92,
        }),
        lastScoreBreakdown: {
          sharpness: 0.92,
          reflectionFree: 0.97,
          alignment: 0.88,
          total: 0.92,
        },
      } as unknown as CameraModuleDeps["scorer"],
      uploader: {
        upload: vi.fn(async (blob: Blob) => {
          uploadedBlobs.push(blob);
          return { ok: true, id: "int-happy-path", uploadedAt: 42 };
        }),
      } as unknown as CameraModuleDeps["uploader"],
      encodeJpeg: vi.fn(async () => {
        // Return a real Blob with JPEG magic bytes.
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])], {
          type: "image/jpeg",
        });
      }) as unknown as CameraModuleDeps["encodeJpeg"],
      now: () => 2000,
    };

    let result: SessionResult | undefined;
    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete: (r) => {
        result = r;
      },
      onError: () => {
        throw new Error("onError should not fire on happy path");
      },
      _deps: deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    fireBlink(1500);
    await handle.done;

    expect(result).toBeDefined();
    expect(result?.status).toBe("success");
    expect(result?.serverResponse.id).toBe("int-happy-path");
    expect(result?.score.total).toBeCloseTo(0.92);
    expect(uploadedBlobs).toHaveLength(1);
    expect(uploadedBlobs[0].type).toBe("image/jpeg");
    expect(uploadedBlobs[0].size).toBeGreaterThan(0);
  });
});
