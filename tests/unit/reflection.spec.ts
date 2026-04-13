import { describe, it, expect } from "vitest";
import { reflectionScore } from "../../src/core/reflection";
import type { FrameView } from "../../src/core/frame-view";

function makeView(width: number, height: number, luma: number): FrameView {
  const rgba = new Uint8ClampedArray(width * height * 4);
  const gray = new Uint8ClampedArray(width * height);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    rgba[p] = luma;
    rgba[p + 1] = luma;
    rgba[p + 2] = luma;
    rgba[p + 3] = 255;
    gray[i] = luma;
  }
  return { width, height, rgba, gray };
}

function injectReflectionBurst(
  view: FrameView,
  box: { x0: number; y0: number; x1: number; y1: number },
): void {
  for (let y = box.y0; y < box.y1; y++) {
    for (let x = box.x0; x < box.x1; x++) {
      const i = y * view.width + x;
      view.gray[i] = 255;
      const p = i * 4;
      view.rgba[p] = 255;
      view.rgba[p + 1] = 255;
      view.rgba[p + 2] = 255;
    }
  }
}

describe("reflectionScore", () => {
  it("returns ~1.0 for a flat mid-gray frame (no highlights)", () => {
    const view = makeView(20, 20, 128);
    const s = reflectionScore(view, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(s).toBeCloseTo(1.0, 5);
  });

  it("drops when a reflection burst is injected inside the face bbox", () => {
    const view = makeView(20, 20, 100);
    // Inject a 10×10 patch of white (luma 255) inside the face bbox.
    injectReflectionBurst(view, { x0: 5, y0: 5, x1: 15, y1: 15 });
    const s = reflectionScore(view, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    expect(s).toBeLessThan(0.75);
    expect(s).toBeGreaterThan(0);
  });

  it("ignores background highlights outside the face bbox", () => {
    const view = makeView(20, 20, 100);
    // Burst OUTSIDE the face bbox — at the corner.
    injectReflectionBurst(view, { x0: 0, y0: 0, x1: 2, y1: 2 });
    const s = reflectionScore(view, { x: 0.3, y: 0.3, w: 0.4, h: 0.4 });
    expect(s).toBeCloseTo(1.0, 5);
  });

  it("falls back to full-view scan when bbox is missing", () => {
    const view = makeView(20, 20, 100);
    injectReflectionBurst(view, { x0: 0, y0: 0, x1: 4, y1: 4 });
    const s = reflectionScore(view, null);
    expect(s).toBeLessThan(1.0);
  });
});
