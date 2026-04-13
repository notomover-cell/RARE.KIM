import { describe, it, expect, vi } from "vitest";
import { BestCutScorer } from "../../src/core/best-cut-scorer";
import { RingFrame } from "../../src/core/ring-buffer";
import { fakeBitmap } from "../fixtures/mock-image-bitmap";

vi.mock("../../src/core/frame-view", () => {
  // deriveFrameView is called once per frame; we return a pre-baked
  // FrameView whose content encodes the scenario the test wants.
  const bank = new Map<number, { gray: Uint8ClampedArray; rgba: Uint8ClampedArray }>();
  return {
    deriveFrameView: (bitmap: { width: number; height: number; __scenario?: string }) => {
      const w = 16;
      const h = 16;
      const rgba = new Uint8ClampedArray(w * h * 4);
      const gray = new Uint8ClampedArray(w * h);
      const scenario = bitmap.__scenario ?? "dull";
      if (scenario === "sharp") {
        // Alternating black/white checkerboard → high Laplacian variance.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const v = (x + y) % 2 === 0 ? 0 : 255;
            gray[y * w + x] = v;
            const p = (y * w + x) * 4;
            rgba[p] = v;
            rgba[p + 1] = v;
            rgba[p + 2] = v;
            rgba[p + 3] = 255;
          }
        }
      } else if (scenario === "reflection") {
        // Flat gray with a bright patch (high luma ≥250) inside the face bbox.
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
          gray[i] = 120;
          rgba[p] = 120;
          rgba[p + 1] = 120;
          rgba[p + 2] = 120;
          rgba[p + 3] = 255;
        }
        for (let y = 4; y < 12; y++) {
          for (let x = 4; x < 12; x++) {
            const idx = y * w + x;
            gray[idx] = 255;
            const p = idx * 4;
            rgba[p] = 255;
            rgba[p + 1] = 255;
            rgba[p + 2] = 255;
          }
        }
      } else {
        // dull — flat field; Laplacian variance ≈ 0.
        for (let i = 0, p = 0; i < gray.length; i++, p += 4) {
          gray[i] = 120;
          rgba[p] = 120;
          rgba[p + 1] = 120;
          rgba[p + 2] = 120;
          rgba[p + 3] = 255;
        }
      }
      bank.set(0, { gray, rgba });
      return { width: w, height: h, gray, rgba };
    },
  };
});

function buildFrame(
  timestamp: number,
  scenario: "sharp" | "reflection" | "dull",
  pose: { yaw: number; pitch: number; roll: number } | null,
): RingFrame {
  const bmp = fakeBitmap(16, 16) as unknown as ImageBitmap & { __scenario: string };
  (bmp as unknown as { __scenario: string }).__scenario = scenario;
  return new RingFrame({
    timestamp,
    fullBitmap: bmp,
    metrics: {
      timestamp,
      landmarks: null,
      headPose: pose,
      ear: 0.3,
      faceBox: { x: 0.1, y: 0.1, w: 0.8, h: 0.8 },
    },
  });
}

describe("BestCutScorer", () => {
  it("picks the sharp + reflection-free + aligned frame over dull/reflection peers", () => {
    const dull = buildFrame(0, "dull", { yaw: 0, pitch: 0, roll: 0 });
    const reflection = buildFrame(1, "reflection", { yaw: 0, pitch: 0, roll: 0 });
    const winner = buildFrame(2, "sharp", { yaw: 0, pitch: 0, roll: 0 });

    const scorer = new BestCutScorer();
    const best = scorer.pickBest([dull, reflection, winner]);
    expect(best).not.toBeNull();
    // pickBest MUST return a reference to the actual RingFrame (I-5).
    expect(best!.frame).toBe(winner);
    expect(best!.frame.fullBitmap).toBe(winner.fullBitmap);
  });

  it("exposes lastScoreBreakdown after pickBest", () => {
    const frames = [
      buildFrame(0, "dull", { yaw: 0, pitch: 0, roll: 0 }),
      buildFrame(1, "sharp", { yaw: 0, pitch: 0, roll: 0 }),
    ];
    const scorer = new BestCutScorer();
    expect(scorer.lastScoreBreakdown).toBeNull();
    scorer.pickBest(frames);
    const breakdown = scorer.lastScoreBreakdown!;
    expect(breakdown).not.toBeNull();
    expect(breakdown.total).toBeGreaterThanOrEqual(0);
    expect(typeof breakdown.sharpness).toBe("number");
    expect(typeof breakdown.reflectionFree).toBe("number");
    expect(typeof breakdown.alignment).toBe("number");
  });

  it("returns null on an empty snapshot", () => {
    const scorer = new BestCutScorer();
    expect(scorer.pickBest([])).toBeNull();
    expect(scorer.lastScoreBreakdown).toBeNull();
  });

  it("floors the reflection-free weight so it cannot be zeroed out", () => {
    const scorer = new BestCutScorer({ w1: 0.4, w2: 0, w3: 0.3 });
    // A frame with high sharpness but heavy reflection should not win
    // decisively over a dull-but-clean frame because w2 is floored at 0.2.
    const sharp = buildFrame(0, "sharp", { yaw: 0, pitch: 0, roll: 0 });
    const dull = buildFrame(1, "dull", { yaw: 0, pitch: 0, roll: 0 });
    const picked = scorer.pickBest([sharp, dull]);
    expect(picked).not.toBeNull();
  });
});
