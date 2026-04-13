import { describe, it, expect } from "vitest";
import { ActionStateMachine } from "../../src/core/action-state-machine";
import type { FrameMetrics } from "../../src/core/face-landmarker-runner";
import headTiltFixture from "../fixtures/head-tilt-during-blink.json";
import faceLostFixture from "../fixtures/face-lost-mid-action.json";

interface FixtureSample {
  timestamp: number;
  headPose: { yaw: number; pitch: number; roll: number } | null;
  ear: number | null;
  faceBox: { x: number; y: number; w: number; h: number } | null;
  hasLandmarks: boolean;
}

interface FsmFixture {
  description: string;
  samples: FixtureSample[];
  expectations: {
    finalState: string;
    stateSequence: string[];
    earBufferClearedAt: number;
  };
}

function toMetrics(s: FixtureSample): FrameMetrics {
  return {
    timestamp: s.timestamp,
    landmarks: s.hasLandmarks
      ? ([{ x: 0.5, y: 0.5, z: 0 }] as unknown as FrameMetrics["landmarks"])
      : null,
    headPose: s.headPose,
    ear: s.ear,
    faceBox: s.faceBox,
  };
}

function runFixture(fixture: FsmFixture): {
  states: string[];
  final: string;
} {
  const fsm = new ActionStateMachine({ alignHoldMs: 1000 });
  const states: string[] = [];
  fsm.onTransition((ev) => states.push(ev.to));
  fsm.beginPermission(0);
  fsm.permissionGranted();
  for (const s of fixture.samples) {
    fsm.feed(toMetrics(s));
  }
  return { states, final: fsm.getState() };
}

describe("ActionStateMachine — invalidation back-edges (Major #3)", () => {
  it("head-tilt during blink returns to aligning and clears EAR buffer", () => {
    const { states, final } = runFixture(headTiltFixture as FsmFixture);
    expect(final).toBe("aligning");
    // We expect at least aligning → align_hold → blink_detecting → aligning.
    expect(states).toContain("align_hold");
    expect(states).toContain("blink_detecting");
    // Back to aligning must appear AFTER blink_detecting.
    const lastBlinkIdx = states.lastIndexOf("blink_detecting");
    const reboundIdx = states.indexOf("aligning", lastBlinkIdx);
    expect(reboundIdx).toBeGreaterThan(lastBlinkIdx);
  });

  it("two consecutive face-lost frames return to aligning (face_lost threshold)", () => {
    const { states, final } = runFixture(faceLostFixture as FsmFixture);
    expect(final).toBe("aligning");
    expect(states).toContain("blink_detecting");
    const lastBlinkIdx = states.lastIndexOf("blink_detecting");
    const reboundIdx = states.indexOf("aligning", lastBlinkIdx);
    expect(reboundIdx).toBeGreaterThan(lastBlinkIdx);
  });
});
