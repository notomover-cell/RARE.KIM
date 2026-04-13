// Helpers for constructing fake ImageBitmap objects under jsdom, where the
// real ImageBitmap type exists as a class but cannot be built from a source.
// Tests rely on structural typing: BestCutScorer and encodeJpeg only read
// `.width`, `.height`, and `.close()` on the bitmap, so a plain object is
// sufficient everywhere we don't actually exercise the 2d canvas path.

import type { RingFrame } from "../../src/core/ring-buffer";

export interface FakeBitmap {
  width: number;
  height: number;
  close: () => void;
  closeCalls: number;
}

export function fakeBitmap(width = 640, height = 360): FakeBitmap {
  const bmp: FakeBitmap = {
    width,
    height,
    closeCalls: 0,
    close() {
      bmp.closeCalls += 1;
    },
  };
  return bmp;
}

export function fakeRingFrame(opts: {
  timestamp?: number;
  width?: number;
  height?: number;
  metrics?: Partial<import("../../src/core/ring-buffer").FrameMetrics>;
} = {}): RingFrame & { __fake: FakeBitmap } {
  const bmp = fakeBitmap(opts.width, opts.height);
  const metrics: import("../../src/core/ring-buffer").FrameMetrics = {
    timestamp: opts.timestamp ?? 0,
    landmarks: opts.metrics?.landmarks ?? null,
    headPose: opts.metrics?.headPose ?? { yaw: 0, pitch: 0, roll: 0 },
    ear: opts.metrics?.ear ?? 0.3,
    faceBox: opts.metrics?.faceBox ?? { x: 0.25, y: 0.2, w: 0.5, h: 0.55 },
  };
  // The real RingFrame class has a `_closed` slot; structural compat is
  // good enough for the scorer/encoder, so we build an object with the same
  // surface.
  let closed = false;
  const frame = {
    timestamp: metrics.timestamp,
    fullBitmap: bmp as unknown as ImageBitmap,
    metrics,
    get closed() {
      return closed;
    },
    close() {
      if (closed) return;
      closed = true;
      bmp.close();
    },
    __fake: bmp,
  } as unknown as RingFrame & { __fake: FakeBitmap };
  return frame;
}
