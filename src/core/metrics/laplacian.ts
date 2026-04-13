// Phase 5 — Sharpness metric via 3×3 Laplacian kernel variance.
//
// Operates on the grayscale plane of a downscaled FrameView. The 3×3 kernel
//   [ 0  1  0 ]
//   [ 1 -4  1 ]
//   [ 0  1  0 ]
// approximates ∇²I; high variance of the convolution output correlates with
// strong edges (sharp focus), low variance correlates with blur. The
// border (1-pixel ring) is skipped to avoid clamping artifacts.

export function laplacianVariance(
  gray: Uint8ClampedArray,
  width: number,
  height: number,
): number {
  if (width < 3 || height < 3) return 0;
  const responses: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    const rowOff = y * width;
    for (let x = 1; x < width - 1; x++) {
      const i = rowOff + x;
      const center = gray[i];
      const up = gray[i - width];
      const down = gray[i + width];
      const left = gray[i - 1];
      const right = gray[i + 1];
      const lap = up + down + left + right - 4 * center;
      responses.push(lap);
    }
  }
  if (responses.length === 0) return 0;
  let mean = 0;
  for (const r of responses) mean += r;
  mean /= responses.length;
  let variance = 0;
  for (const r of responses) {
    const d = r - mean;
    variance += d * d;
  }
  variance /= responses.length;
  return variance;
}
