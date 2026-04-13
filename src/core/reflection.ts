// Phase 5 — Reflection rejection metric.
//
// Computes a luminance histogram restricted to the face bbox region of the
// downscaled FrameView. The fraction of pixels falling into the highest
// luminance bins (250..255) is treated as the "reflection ratio" — strong
// specular highlights from glasses or skin saturate near 255. We return
// `reflectionFree = 1 - ratio` so that higher = better and the score can
// be combined linearly with sharpness/alignment by BestCutScorer.
//
// Why face bbox only (not the full frame): the spec requires the metric to
// reject reflections ON the face. Background highlights (window glare,
// hand-held mirrors) are irrelevant; counting them creates false rejects.
// If no face bbox is available the function falls back to the full view.

import type { FrameView } from "./frame-view";
import type { FaceBox } from "./ring-buffer";

const HIGH_BIN_LO = 250;
const HIGH_BIN_HI = 255;

export function reflectionScore(view: FrameView, faceBox: FaceBox | null): number {
  const { width, height, rgba } = view;

  // Resolve the bbox in view pixel coordinates. faceBox is normalized 0..1.
  let x0 = 0;
  let y0 = 0;
  let x1 = width;
  let y1 = height;
  if (faceBox) {
    x0 = Math.max(0, Math.floor(faceBox.x * width));
    y0 = Math.max(0, Math.floor(faceBox.y * height));
    x1 = Math.min(width, Math.ceil((faceBox.x + faceBox.w) * width));
    y1 = Math.min(height, Math.ceil((faceBox.y + faceBox.h) * height));
    if (x1 - x0 < 2 || y1 - y0 < 2) {
      // Degenerate bbox — fall back to full view rather than divide by zero.
      x0 = 0;
      y0 = 0;
      x1 = width;
      y1 = height;
    }
  }

  let total = 0;
  let high = 0;
  for (let y = y0; y < y1; y++) {
    const rowOff = y * width;
    for (let x = x0; x < x1; x++) {
      const p = (rowOff + x) * 4;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const luma = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
      if (luma >= HIGH_BIN_LO && luma <= HIGH_BIN_HI) high++;
      total++;
    }
  }
  if (total === 0) return 1;
  const ratio = high / total;
  return 1 - ratio;
}
