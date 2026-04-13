// Single source of truth for runtime tuning constants.
// All values frozen here are referenced from spec AC1-AC15 and the
// Performance Budget section of the plan.

import type { ScoreBreakdown } from "./types";

// Best-cut scorer weights — default 0.4 : 0.3 : 0.3 (sharpness : reflectionFree : alignment).
// Tuning trigger: >5% reflection false-reject in internal sessions → reduce w2 by 0.05.
// Safe floor: w2 must remain >= 0.2 (below this, reflection is effectively ignored).
export const SCORE_WEIGHTS = {
  sharpness: 0.4,
  reflectionFree: 0.3,
  alignment: 0.3,
} as const;

export const SCORE_W2_FLOOR = 0.2;

// Ring buffer (Phase 5).
// 20 frames × 640×360 RGBA ≈ 18 MB. Phase 10 downgrade trigger: iPhone SE peak heap > 60 MB → 12.
export const RING_BUFFER_CAPACITY = 20;
export const RING_FRAME_WIDTH = 640;
export const RING_FRAME_HEIGHT = 360;
export const RING_BYTES_PER_PIXEL = 4;
export const RING_BUFFER_MAX_BYTES =
  RING_BUFFER_CAPACITY * RING_FRAME_WIDTH * RING_FRAME_HEIGHT * RING_BYTES_PER_PIXEL;

// Downscaled compute view used by sharpness/reflection metrics.
export const FRAME_VIEW_WIDTH = 160;
export const FRAME_VIEW_HEIGHT = 90;

// Action state machine (Phase 4) — AC3, AC4, AC10.
export const ALIGN_HOLD_MS = 1000;
export const SESSION_TIMEOUT_MS = 15000;
export const MAX_RETRIES = 3;
export const MAX_BLINK_RETRIES_BEFORE_FALLBACK = 2;
export const FACE_LOST_FRAME_THRESHOLD = 2;

// Pose gates (degrees) for ALIGNING → ALIGN_HOLD transition.
export const YAW_MAX_DEG = 12;
export const PITCH_MAX_DEG = 12;
export const ROLL_MAX_DEG = 12;

// Eye Aspect Ratio thresholds for blink detection.
export const EAR_BLINK_CLOSED_MAX = 0.18;
export const EAR_BLINK_OPEN_MIN = 0.24;
export const EAR_ROLLING_WINDOW = 3;

// JPEG encoder.
export const JPEG_QUALITY_DEFAULT = 0.92;

// Performance budget (Phase 10 verification thresholds).
export const PERF_BUDGET_TOTAL_MS = 5000;
export const PERF_S4_LITE_DOWNGRADE_TRIGGER_MS = 800;
export const PERF_PEAK_HEAP_DOWNGRADE_TRIGGER_MB = 60;

// Default zero-score breakdown (used by stubs and tests).
export const ZERO_SCORE: ScoreBreakdown = {
  sharpness: 0,
  reflectionFree: 0,
  alignment: 0,
  total: 0,
};
