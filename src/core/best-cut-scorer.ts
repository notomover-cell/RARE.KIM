// Phase 5 — Best-cut scorer.
//
// Three-axis weighted scorer: sharpness × reflectionFree × alignment.
// Operates on a snapshot of RingFrame objects from the ring buffer at
// BLINK_CONFIRMED time. For each frame:
//   1. derive a downscaled FrameView from the OWNED full-resolution bitmap
//   2. compute Laplacian variance on the gray plane (sharpness, raw)
//   3. compute reflectionFree from the face-bbox luminance histogram
//   4. compute alignment from yaw/pitch/roll (and bbox center if available)
//   5. min-max normalize each axis across the snapshot, weight, and sum
//
// pickBest() returns the ScoredFrame whose `frame` is the OWNED RingFrame
// (Invariant I-5). The encoder consumes `frame.fullBitmap` directly — there
// is no thumbnail involved, no re-sampling, no path that produces a Blob
// from any other source.
//
// Telemetry: `lastScoreBreakdown` exposes the post-normalization per-axis
// values of the winning frame so dev/staging logging can drive Risk #3
// tuning (target: <5% reflection false-reject rate).

import { SCORE_W2_FLOOR, SCORE_WEIGHTS } from "../module/thresholds";
import { deriveFrameView, type FrameView } from "./frame-view";
import { laplacianVariance } from "./metrics/laplacian";
import { reflectionScore } from "./reflection";
import type { RingFrame, HeadPose } from "./ring-buffer";

export interface ScoreWeights {
  /** Sharpness weight. */
  w1: number;
  /** Reflection-free weight. Floored at SCORE_W2_FLOOR. */
  w2: number;
  /** Alignment weight. */
  w3: number;
}

export interface ScoreAxes {
  sharpness: number;
  reflectionFree: number;
  alignment: number;
  total: number;
}

export interface ScoredFrame {
  /** Reference to the OWNED full-resolution RingFrame. */
  frame: RingFrame;
  sharpness: number;
  reflectionFree: number;
  alignment: number;
  total: number;
}

const POSE_NORMALIZE_DEG = 30; // poses beyond ±30° score 0 on alignment.

function alignmentScore(pose: HeadPose | null): number {
  if (!pose) return 0;
  const norm = (deg: number): number => {
    const abs = Math.abs(deg);
    if (abs >= POSE_NORMALIZE_DEG) return 0;
    return 1 - abs / POSE_NORMALIZE_DEG;
  };
  // Equal weight across axes; bbox-distance refinement is left for Phase 7
  // (overlay-renderer publishes the guide center) so the scorer remains
  // independent of UI geometry.
  return (norm(pose.yaw) + norm(pose.pitch) + norm(pose.roll)) / 3;
}

function minMaxNormalize(values: number[]): number[] {
  if (values.length === 0) return [];
  let lo = values[0];
  let hi = values[0];
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const range = hi - lo;
  if (range === 0) {
    return values.map(() => 1);
  }
  return values.map((v) => (v - lo) / range);
}

function applyWeightFloor(weights: ScoreWeights): ScoreWeights {
  const w2 = Math.max(SCORE_W2_FLOOR, weights.w2);
  return { w1: weights.w1, w2, w3: weights.w3 };
}

export class BestCutScorer {
  private readonly weights: ScoreWeights;
  private readonly viewWidth: number | undefined;
  private readonly viewHeight: number | undefined;
  private _lastScoreBreakdown: ScoreAxes | null = null;

  constructor(
    weights: ScoreWeights = {
      w1: SCORE_WEIGHTS.sharpness,
      w2: SCORE_WEIGHTS.reflectionFree,
      w3: SCORE_WEIGHTS.alignment,
    },
    viewWidth?: number,
    viewHeight?: number,
  ) {
    this.weights = applyWeightFloor(weights);
    this.viewWidth = viewWidth;
    this.viewHeight = viewHeight;
  }

  /** Telemetry: per-axis breakdown of the most recent winning frame. */
  get lastScoreBreakdown(): ScoreAxes | null {
    return this._lastScoreBreakdown;
  }

  /**
   * Score a snapshot of frames. Frames are NOT mutated and ownership is
   * NOT transferred — callers (typically pickBest) hold ScoredFrame
   * objects whose `frame` references still belong to the ring buffer.
   */
  score(frames: RingFrame[]): ScoredFrame[] {
    if (frames.length === 0) return [];

    // Pass 1 — compute raw per-axis values.
    const raw: { sharpness: number; reflectionFree: number; alignment: number }[] = [];
    for (const f of frames) {
      const view: FrameView = deriveFrameView(f.fullBitmap, this.viewWidth, this.viewHeight);
      const sharpness = laplacianVariance(view.gray, view.width, view.height);
      const reflectionFree = reflectionScore(view, f.metrics.faceBox);
      const alignment = alignmentScore(f.metrics.headPose);
      raw.push({ sharpness, reflectionFree, alignment });
    }

    // Pass 2 — min-max normalize each axis across the snapshot so the
    // weighted sum is comparable across sessions / lighting conditions.
    const sharps = minMaxNormalize(raw.map((r) => r.sharpness));
    // reflectionFree and alignment are already in [0,1] but we still
    // normalize so a snapshot of all-equally-clean frames does not have
    // its winner picked by sharpness alone.
    const refls = minMaxNormalize(raw.map((r) => r.reflectionFree));
    const aligns = minMaxNormalize(raw.map((r) => r.alignment));

    const { w1, w2, w3 } = this.weights;
    const out: ScoredFrame[] = frames.map((frame, i) => ({
      frame,
      sharpness: sharps[i],
      reflectionFree: refls[i],
      alignment: aligns[i],
      total: w1 * sharps[i] + w2 * refls[i] + w3 * aligns[i],
    }));
    return out;
  }

  /**
   * Return the highest-scoring frame, or null if the snapshot is empty.
   * The returned ScoredFrame.frame IS the bitmap that the encoder must
   * consume — Invariant I-5.
   */
  pickBest(frames: RingFrame[]): ScoredFrame | null {
    const scored = this.score(frames);
    if (scored.length === 0) {
      this._lastScoreBreakdown = null;
      return null;
    }
    let best = scored[0];
    for (let i = 1; i < scored.length; i++) {
      if (scored[i].total > best.total) best = scored[i];
    }
    this._lastScoreBreakdown = {
      sharpness: best.sharpness,
      reflectionFree: best.reflectionFree,
      alignment: best.alignment,
      total: best.total,
    };
    return best;
  }
}
