// Phase 6 — encode the OWNED full-resolution ImageBitmap of the best scored frame.
// Never touches the live <video> element. Always closes bestFrame via try/finally
// (AC13, Rec D). Two code paths:
//   Path A: OffscreenCanvas.convertToBlob (iOS Safari 16.4+, modern Chrome)
//   Path B: HTMLCanvasElement.toBlob fallback (iOS Safari 15.0 / 16.0 / 16.3)

import { JPEG_QUALITY_DEFAULT } from "../module/thresholds";
import type { RingFrame } from "./ring-buffer";

type OffscreenCtor = typeof OffscreenCanvas;

function hasOffscreenConvertToBlob(): boolean {
  const Ctor = (globalThis as unknown as { OffscreenCanvas?: OffscreenCtor }).OffscreenCanvas;
  if (typeof Ctor === "undefined") return false;
  return typeof Ctor.prototype.convertToBlob === "function";
}

export async function encodeJpeg(
  bestFrame: RingFrame,
  quality: number = JPEG_QUALITY_DEFAULT,
): Promise<Blob> {
  try {
    const width = bestFrame.fullBitmap.width;
    const height = bestFrame.fullBitmap.height;

    if (hasOffscreenConvertToBlob()) {
      // Path A — iOS Safari 16.4+, Android Chrome.
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext("2d", { willReadFrequently: false });
      if (!ctx) throw new Error("OffscreenCanvas 2d context unavailable");
      ctx.drawImage(bestFrame.fullBitmap, 0, 0);
      return await canvas.convertToBlob({ type: "image/jpeg", quality });
    }

    // Path B — iOS Safari 15.0 / 16.0 / 16.3 (no OffscreenCanvas.convertToBlob).
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("HTMLCanvasElement 2d context unavailable");
    ctx.drawImage(bestFrame.fullBitmap, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("toBlob returned null"))),
        "image/jpeg",
        quality,
      );
    });
  } finally {
    // AC13: always release the owned bitmap, even if draw/encode throws.
    bestFrame.close();
  }
}
