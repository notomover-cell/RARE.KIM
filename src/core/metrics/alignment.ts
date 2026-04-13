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
  reason?: "no_landmarks" | "yaw" | "pitch" | "roll" | "face_too_small" | "face_off_center";
}

export function evaluateAlignment(
  metrics: FrameMetrics,
  gate: AlignmentGate & { minFaceWidthRatio?: number; maxCenterOffset?: number },
): AlignmentResult {
  if (!metrics.landmarks || !metrics.headPose) {
    return { aligned: false, reason: "no_landmarks" };
  }
  if (gate.minFaceWidthRatio && metrics.faceBox && metrics.faceBox.w < gate.minFaceWidthRatio) {
    return { aligned: false, reason: "face_too_small" };
  }
  // Check face center is within the guide oval area.
  // faceBox is normalized 0..1; center of frame is (0.5, 0.5).
  if (gate.maxCenterOffset && metrics.faceBox) {
    const faceCenterX = metrics.faceBox.x + metrics.faceBox.w / 2;
    const faceCenterY = metrics.faceBox.y + metrics.faceBox.h / 2;
    const dx = faceCenterX - 0.5;
    const dy = faceCenterY - 0.5;
    // Elliptical distance: the guide oval is taller than wide,
    // so use ~0.7 horizontal radius and ~0.9 vertical radius (normalized).
    const ellipseDist = (dx * dx) / (0.35 * 0.35) + (dy * dy) / (0.45 * 0.45);
    if (ellipseDist > 1.0) {
      return { aligned: false, reason: "face_off_center" };
    }
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
