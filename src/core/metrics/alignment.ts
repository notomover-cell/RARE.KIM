// Alignment gate — decides whether a given FrameMetrics sample satisfies the
// yaw/pitch/roll constraints that permit `ALIGNING → ALIGN_HOLD` in the
// action state machine. Kept pure so the FSM unit tests can feed synthetic
// metrics without a MediaPipe dependency.

import type { FrameMetrics } from "../face-landmarker-runner";

export interface AlignmentGate {
  yawMaxDeg: number;
  pitchMaxDeg: number;
  rollMaxDeg: number;
}

export interface AlignmentResult {
  aligned: boolean;
  reason?: "no_landmarks" | "yaw" | "pitch" | "roll";
}

export function evaluateAlignment(
  metrics: FrameMetrics,
  gate: AlignmentGate,
): AlignmentResult {
  if (!metrics.landmarks || !metrics.headPose) {
    return { aligned: false, reason: "no_landmarks" };
  }
  const { yaw, pitch, roll } = metrics.headPose;
  if (Math.abs(yaw) > gate.yawMaxDeg) return { aligned: false, reason: "yaw" };
  if (Math.abs(pitch) > gate.pitchMaxDeg) {
    return { aligned: false, reason: "pitch" };
  }
  if (Math.abs(roll) > gate.rollMaxDeg) return { aligned: false, reason: "roll" };
  return { aligned: true };
}

export function isFaceLost(metrics: FrameMetrics): boolean {
  return metrics.landmarks === null;
}
