// Phase 5 — Downscaled compute view derived from a full-resolution ImageBitmap.
//
// Invariant I-6: deriveFrameView is a pure function. It MUST NOT cache the
// view on the source frame, and the returned buffers are throwaway — the
// caller (BestCutScorer) holds them only for the duration of the scoring
// pass and lets them be GC'd immediately after.
//
// The view is sized to FRAME_VIEW_WIDTH × FRAME_VIEW_HEIGHT (default 160×90)
// which is large enough for stable Laplacian variance and luminance
// histogram statistics while keeping the per-frame compute under ~5 ms.

import { FRAME_VIEW_HEIGHT, FRAME_VIEW_WIDTH } from "../module/thresholds";

export interface FrameView {
  width: number;
  height: number;
  /** Luminance plane, length = width * height. */
  gray: Uint8ClampedArray;
  /** RGBA pixels, length = width * height * 4. */
  rgba: Uint8ClampedArray;
}

type AnyCanvas2DContext =
  | OffscreenCanvasRenderingContext2D
  | CanvasRenderingContext2D;

interface RenderTarget {
  ctx: AnyCanvas2DContext;
  getImageData(width: number, height: number): ImageData;
}

function createRenderTarget(width: number, height: number): RenderTarget {
  const Off = (globalThis as unknown as { OffscreenCanvas?: typeof OffscreenCanvas }).OffscreenCanvas;
  if (typeof Off === "function") {
    const canvas = new Off(width, height);
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("frame-view: OffscreenCanvas 2d context unavailable");
    return {
      ctx: ctx as OffscreenCanvasRenderingContext2D,
      getImageData: (w, h) => (ctx as OffscreenCanvasRenderingContext2D).getImageData(0, 0, w, h),
    };
  }
  if (typeof document === "undefined") {
    throw new Error("frame-view: neither OffscreenCanvas nor document available");
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("frame-view: HTMLCanvasElement 2d context unavailable");
  return {
    ctx,
    getImageData: (w, h) => ctx.getImageData(0, 0, w, h),
  };
}

/**
 * Render the source bitmap into a small RGBA buffer and compute its
 * luminance plane. The returned FrameView shares no memory with the
 * source bitmap — the caller may discard it after one scoring pass.
 */
export function deriveFrameView(
  bitmap: ImageBitmap,
  targetW: number = FRAME_VIEW_WIDTH,
  targetH: number = FRAME_VIEW_HEIGHT,
): FrameView {
  const target = createRenderTarget(targetW, targetH);
  // drawImage with explicit dst dims performs the downscale in one pass.
  target.ctx.drawImage(bitmap, 0, 0, targetW, targetH);
  const imageData = target.getImageData(targetW, targetH);
  const rgba = imageData.data;
  const gray = new Uint8ClampedArray(targetW * targetH);
  for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
    // Rec. 601 luma — matches the histogram convention used by reflection.ts.
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    gray[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0;
  }
  return { width: targetW, height: targetH, gray, rgba };
}
