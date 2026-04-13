import { describe, it, expect } from "vitest";
import { RingBuffer, RingFrame } from "../../src/core/ring-buffer";
import { fakeBitmap } from "../fixtures/mock-image-bitmap";

function makeFrame(timestamp: number): { frame: RingFrame; bmp: ReturnType<typeof fakeBitmap> } {
  const bmp = fakeBitmap();
  const frame = new RingFrame({
    timestamp,
    fullBitmap: bmp as unknown as ImageBitmap,
    metrics: {
      timestamp,
      landmarks: null,
      headPose: { yaw: 0, pitch: 0, roll: 0 },
      ear: 0.3,
      faceBox: { x: 0, y: 0, w: 1, h: 1 },
    },
  });
  return { frame, bmp };
}

describe("RingBuffer", () => {
  it("stays within capacity by evicting the oldest frame", () => {
    const buf = new RingBuffer({ capacity: 3 });
    const frames = [0, 1, 2, 3].map((t) => makeFrame(t));
    for (const { frame } of frames) buf.push(frame);

    expect(buf.size()).toBe(3);
    // Oldest (t=0) was evicted, so its bitmap close() was called.
    expect(frames[0].bmp.closeCalls).toBe(1);
    // The three remaining frames are not closed.
    expect(frames[1].bmp.closeCalls).toBe(0);
    expect(frames[2].bmp.closeCalls).toBe(0);
    expect(frames[3].bmp.closeCalls).toBe(0);
  });

  it("detach removes a frame without closing it (ownership transfer)", () => {
    const buf = new RingBuffer({ capacity: 4 });
    const { frame, bmp } = makeFrame(10);
    buf.push(frame);
    expect(buf.detach(frame)).toBe(true);
    expect(buf.size()).toBe(0);
    expect(bmp.closeCalls).toBe(0);
    // Detaching twice is a no-op.
    expect(buf.detach(frame)).toBe(false);
  });

  it("clear() closes every remaining frame exactly once", () => {
    const buf = new RingBuffer({ capacity: 4 });
    const frames = [1, 2, 3].map((t) => makeFrame(t));
    frames.forEach(({ frame }) => buf.push(frame));
    buf.clear();
    expect(buf.size()).toBe(0);
    for (const { bmp } of frames) expect(bmp.closeCalls).toBe(1);
    // clear() is idempotent.
    buf.clear();
  });

  it("getWindow returns frames within ±halfSpan of centerTs", () => {
    const buf = new RingBuffer({ capacity: 10 });
    [0, 100, 200, 300, 400].forEach((t) => buf.push(makeFrame(t).frame));
    const w = buf.getWindow(200, 120);
    expect(w.map((f) => f.timestamp)).toEqual([100, 200, 300]);
  });

  it("estimatedBytes() enforces the memory budget guard", () => {
    // 20 frames × 640×360×4 bytes == default budget. 21 busts it.
    expect(() => new RingBuffer({ capacity: 21 })).toThrow(/budget/);
  });

  it("RingFrame.close() is idempotent and safe when close is missing", () => {
    const bmp = { width: 640, height: 360 } as unknown as ImageBitmap;
    const frame = new RingFrame({
      timestamp: 0,
      fullBitmap: bmp,
      metrics: {
        timestamp: 0,
        landmarks: null,
        headPose: null,
        ear: null,
        faceBox: null,
      },
    });
    expect(() => frame.close()).not.toThrow();
    expect(frame.closed).toBe(true);
    // Double-close is a no-op.
    frame.close();
    expect(frame.closed).toBe(true);
  });
});
