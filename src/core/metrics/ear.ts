// Eye Aspect Ratio (EAR) metric used by the blink detector (AC4).
//
// The standard Soukupová & Čech 6-point formula is:
//   EAR = (|p2 - p6| + |p3 - p5|) / (2 * |p1 - p4|)
// where p1..p6 are the six eye contour points in landmark order.
//
// MediaPipe FaceLandmarker emits 478 normalized landmarks. The indices below
// pick the six canonical contour points per eye (matching the MediaPipe Face
// Mesh reference layout) and are used by `computeEAR`.

import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// Indices into the FaceLandmarker 478-point model.
// Order: p1 (outer corner), p2 (upper-1), p3 (upper-2), p4 (inner corner),
//        p5 (lower-2), p6 (lower-1).
export const LEFT_EYE_INDICES: readonly number[] = [33, 160, 158, 133, 153, 144];
export const RIGHT_EYE_INDICES: readonly number[] = [362, 385, 387, 263, 373, 380];

function dist(a: NormalizedLandmark, b: NormalizedLandmark): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export function earForEye(
  landmarks: NormalizedLandmark[],
  idx: readonly number[],
): number {
  const p1 = landmarks[idx[0]];
  const p2 = landmarks[idx[1]];
  const p3 = landmarks[idx[2]];
  const p4 = landmarks[idx[3]];
  const p5 = landmarks[idx[4]];
  const p6 = landmarks[idx[5]];
  if (!p1 || !p2 || !p3 || !p4 || !p5 || !p6) return 0;
  const vertical = dist(p2, p6) + dist(p3, p5);
  const horizontal = 2 * dist(p1, p4);
  if (horizontal === 0) return 0;
  return vertical / horizontal;
}

export function computeEAR(landmarks: NormalizedLandmark[] | null | undefined): number | null {
  if (!landmarks || landmarks.length < 478) return null;
  const left = earForEye(landmarks, LEFT_EYE_INDICES);
  const right = earForEye(landmarks, RIGHT_EYE_INDICES);
  return (left + right) / 2;
}

// Sliding-window blink detector. Returns true when a closed→open transition
// is detected inside the rolling buffer using the open/closed thresholds.
export interface BlinkDetectorOptions {
  closedMax: number;   // EAR at-or-below this counts as "closed"
  openMin: number;     // EAR at-or-above this counts as "open" (must exceed closedMax)
  minClosedFrames: number; // consecutive closed frames required before recovery
  windowSize: number;  // rolling window length
}

export function isBlink(
  samples: readonly number[],
  opts: BlinkDetectorOptions,
): boolean {
  if (samples.length < opts.minClosedFrames + 1) return false;
  const window = samples.slice(-opts.windowSize);

  let closedRun = 0;
  let sawClosedRun = false;
  for (const s of window) {
    if (s <= opts.closedMax) {
      closedRun += 1;
      if (closedRun >= opts.minClosedFrames) {
        sawClosedRun = true;
      }
    } else if (sawClosedRun && s >= opts.openMin) {
      return true;
    } else if (s >= opts.openMin) {
      closedRun = 0;
    }
  }
  return false;
}
