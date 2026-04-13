// AC9 — end-to-end reflection rejection.
// Inject 10 candidate frames where frame #5 has a heavy white-reflection burst
// (luminance histogram heavy in 250..255) and the rest are clean, then run the
// full BestCutScorer → encodeJpeg path. Assert the frame handed to the
// Uploader is NOT the burst frame. The "pixel hash" is a cheap identity tag
// we stamp on each fake bitmap so we can check which frame survived scoring.

import { describe, it, expect, vi } from "vitest";
import { CameraModule, type CameraModuleDeps } from "../../src/module/camera-module";
import { BestCutScorer } from "../../src/core/best-cut-scorer";
import type { RingFrame } from "../../src/core/ring-buffer";
import type { FrameView } from "../../src/core/frame-view";

// Stamp each fake bitmap with a unique hash so we can identify which one the
// scorer picked after the fact. Also mock deriveFrameView to return different
// luminance stats based on the stamped scenario.
interface FakeBitmap {
  __hash: string;
  __scenario: "sharp-clean" | "sharp-reflection" | "blurry";
  width: number;
  height: number;
  close(): void;
}

function mkBitmap(hash: string, scenario: FakeBitmap["__scenario"]): FakeBitmap {
  return {
    __hash: hash,
    __scenario: scenario,
    width: 160,
    height: 90,
    close: () => {},
  };
}

// Synthesize a FrameView matching each scenario.
vi.mock("../../src/core/frame-view", () => ({
  deriveFrameView(bitmap: FakeBitmap): FrameView {
    const w = 160;
    const h = 90;
    const gray = new Uint8ClampedArray(w * h);
    const rgba = new Uint8ClampedArray(w * h * 4);
    if (bitmap.__scenario === "sharp-clean") {
      // Checkerboard → high Laplacian variance, no bright pixels.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const v = (x + y) % 2 === 0 ? 80 : 180;
          gray[y * w + x] = v;
          const p = (y * w + x) * 4;
          rgba[p] = v;
          rgba[p + 1] = v;
          rgba[p + 2] = v;
          rgba[p + 3] = 255;
        }
      }
    } else if (bitmap.__scenario === "sharp-reflection") {
      // Checkerboard base + large 250..255 burst in bbox region.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let v = (x + y) % 2 === 0 ? 80 : 180;
          // 30% of the face bbox region saturated.
          if (x > 40 && x < 120 && y > 20 && y < 70) {
            v = 252;
          }
          gray[y * w + x] = v;
          const p = (y * w + x) * 4;
          rgba[p] = v;
          rgba[p + 1] = v;
          rgba[p + 2] = v;
          rgba[p + 3] = 255;
        }
      }
    } else {
      // Flat gray → low Laplacian variance → low sharpness.
      gray.fill(128);
      for (let i = 0; i < rgba.length; i += 4) {
        rgba[i] = 128;
        rgba[i + 1] = 128;
        rgba[i + 2] = 128;
        rgba[i + 3] = 255;
      }
    }
    return { width: w, height: h, gray, rgba };
  },
}));

function mkRingFrame(hash: string, scenario: FakeBitmap["__scenario"], ts: number): RingFrame {
  const bitmap = mkBitmap(hash, scenario);
  const closeFn = vi.fn();
  return {
    fullBitmap: bitmap as unknown as ImageBitmap,
    timestamp: ts,
    closed: false,
    metrics: {
      timestamp: ts,
      landmarks: null,
      headPose: { yaw: 0, pitch: 0, roll: 0 },
      ear: 0.3,
      faceBox: { x: 0.25, y: 0.2, w: 0.5, h: 0.6 },
    },
    close: closeFn,
  } as unknown as RingFrame;
}

describe("Integration — AC9 reflection rejection", () => {
  it("does NOT upload the reflection-burst frame even when it sits mid-window", async () => {
    // Build 10 candidates: 9 clean + 1 burst at index 5.
    const frames: RingFrame[] = [];
    for (let i = 0; i < 10; i++) {
      if (i === 5) {
        frames.push(mkRingFrame(`hash-burst-${i}`, "sharp-reflection", 1000 + i * 60));
      } else {
        frames.push(mkRingFrame(`hash-clean-${i}`, "sharp-clean", 1000 + i * 60));
      }
    }

    // Real BestCutScorer (will rank via mocked deriveFrameView).
    const scorer = new BestCutScorer();
    const best = scorer.pickBest(frames);
    expect(best).not.toBeNull();
    // Scorer-level assertion: the chosen frame is NOT the burst.
    const chosenBitmap = best!.frame.fullBitmap as unknown as FakeBitmap;
    expect(chosenBitmap.__scenario).not.toBe("sharp-reflection");
    expect(chosenBitmap.__hash).not.toBe("hash-burst-5");

    // Now run CameraModule end-to-end. Use the same frames list and real scorer.
    const uploadedHashes: string[] = [];
    const blinkCbs: Array<(ts: number) => void> = [];
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
      fsm: {
        beginPermission: vi.fn(),
        permissionGranted: vi.fn(),
        feed: vi.fn(),
        markCaptured: vi.fn(),
        beginUpload: vi.fn(),
        uploadSucceeded: vi.fn(),
        uploadFailed: vi.fn(),
        onBlinkConfirmed: (cb: (ts: number) => void) => blinkCbs.push(cb),
        onTimeout: () => {},
        onCaptureReady: () => {},
        onTransition: () => {},
        onRetryExhausted: () => {},
        getState: () => "idle",
      } as unknown as CameraModuleDeps["fsm"],
      ringBuffer: {
        push: vi.fn(),
        snapshot: vi.fn().mockReturnValue(frames),
        detach: vi.fn(),
        clear: vi.fn(),
        size: vi.fn().mockReturnValue(frames.length),
      } as unknown as CameraModuleDeps["ringBuffer"],
      scorer: new BestCutScorer() as unknown as CameraModuleDeps["scorer"],
      uploader: {
        upload: vi.fn(async () => ({
          ok: true,
          id: "reflect-test",
          uploadedAt: 99,
        })),
      } as unknown as CameraModuleDeps["uploader"],
      encodeJpeg: vi.fn(async (frame: RingFrame) => {
        // Capture the hash of the frame handed to the encoder — this is the
        // frame that will be uploaded.
        const bmp = frame.fullBitmap as unknown as FakeBitmap;
        uploadedHashes.push(bmp.__hash);
        return new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" });
      }) as unknown as CameraModuleDeps["encodeJpeg"],
      now: () => 2000,
    };

    const handle = CameraModule.start({
      uploadUrl: "http://localhost:3001/api/face-capture",
      onComplete: () => {},
      onError: (e) => {
        throw new Error(`session errored: ${e.code} ${e.message}`);
      },
      _deps: deps,
    });
    await Promise.resolve();
    await Promise.resolve();
    blinkCbs.forEach((cb) => cb(1300));
    await handle.done;

    expect(uploadedHashes).toHaveLength(1);
    expect(uploadedHashes[0]).not.toBe("hash-burst-5");
    expect(uploadedHashes[0].startsWith("hash-clean-")).toBe(true);
  });
});
