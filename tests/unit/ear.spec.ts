import { describe, it, expect } from "vitest";
import type { NormalizedLandmark } from "@mediapipe/tasks-vision";
import {
  computeEAR,
  earForEye,
  isBlink,
  LEFT_EYE_INDICES,
  RIGHT_EYE_INDICES,
} from "../../src/core/metrics/ear";

function makeLandmarks(patch: Record<number, { x: number; y: number }>): NormalizedLandmark[] {
  const arr: NormalizedLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    arr.push({ x: 0, y: 0, z: 0 });
  }
  for (const [idx, pt] of Object.entries(patch)) {
    arr[Number(idx)] = { x: pt.x, y: pt.y, z: 0 };
  }
  return arr;
}

function placeEye(
  indices: readonly number[],
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): Record<number, { x: number; y: number }> {
  const [p1, p2, p3, p4, p5, p6] = indices;
  return {
    [p1]: { x: cx - halfW, y: cy },       // outer corner
    [p2]: { x: cx - halfW / 2, y: cy - halfH }, // upper-1
    [p3]: { x: cx + halfW / 2, y: cy - halfH }, // upper-2
    [p4]: { x: cx + halfW, y: cy },             // inner corner
    [p5]: { x: cx + halfW / 2, y: cy + halfH }, // lower-2
    [p6]: { x: cx - halfW / 2, y: cy + halfH }, // lower-1
  };
}

describe("computeEAR / earForEye", () => {
  it("returns null when landmarks are missing or too short", () => {
    expect(computeEAR(null)).toBeNull();
    expect(computeEAR(undefined)).toBeNull();
    expect(computeEAR([])).toBeNull();
  });

  it("gives a higher EAR for a wide-open eye than a mostly-closed one", () => {
    const open = makeLandmarks({
      ...placeEye(LEFT_EYE_INDICES, 0.3, 0.4, 0.05, 0.025),
      ...placeEye(RIGHT_EYE_INDICES, 0.7, 0.4, 0.05, 0.025),
    });
    const closed = makeLandmarks({
      ...placeEye(LEFT_EYE_INDICES, 0.3, 0.4, 0.05, 0.003),
      ...placeEye(RIGHT_EYE_INDICES, 0.7, 0.4, 0.05, 0.003),
    });
    const openEar = computeEAR(open)!;
    const closedEar = computeEAR(closed)!;
    expect(openEar).toBeGreaterThan(closedEar);
    expect(closedEar).toBeLessThan(0.18);
    expect(openEar).toBeGreaterThan(0.24);
  });

  it("earForEye returns 0 for a degenerate horizontal baseline", () => {
    const lm = makeLandmarks({
      33: { x: 0.3, y: 0.4 },
      133: { x: 0.3, y: 0.4 }, // same point → horizontal == 0
      160: { x: 0.28, y: 0.38 },
      158: { x: 0.32, y: 0.38 },
      153: { x: 0.32, y: 0.42 },
      144: { x: 0.28, y: 0.42 },
    });
    expect(earForEye(lm, LEFT_EYE_INDICES)).toBe(0);
  });
});

describe("isBlink (windowed detector)", () => {
  const opts = { closedMax: 0.18, openMin: 0.24, minClosedFrames: 2, windowSize: 12 };

  it("returns false when buffer is too short", () => {
    expect(isBlink([0.1, 0.1], opts)).toBe(false);
  });

  it("detects a closed→open transition with sufficient closed frames", () => {
    expect(isBlink([0.3, 0.28, 0.15, 0.14, 0.26], opts)).toBe(true);
  });

  it("ignores sustained-closed eyes with no recovery", () => {
    expect(isBlink([0.3, 0.28, 0.15, 0.14, 0.13, 0.12], opts)).toBe(false);
  });

  it("ignores single-frame dips (below minClosedFrames)", () => {
    expect(isBlink([0.3, 0.3, 0.15, 0.3, 0.3], opts)).toBe(false);
  });
});
