import { describe, it, expect, vi } from "vitest";
import { ActionStateMachine } from "../../src/core/action-state-machine";
import type { FrameMetrics } from "../../src/core/face-landmarker-runner";

function frame(
  timestamp: number,
  override: Partial<FrameMetrics> = {},
): FrameMetrics {
  return {
    timestamp,
    landmarks: [{ x: 0.5, y: 0.5, z: 0 }] as unknown as FrameMetrics["landmarks"],
    headPose: { yaw: 0, pitch: 0, roll: 0 },
    ear: 0.3,
    faceBox: { x: 0.25, y: 0.25, w: 0.5, h: 0.5 },
    ...override,
  };
}

describe("ActionStateMachine — happy path", () => {
  it("aligns → holds → prompts blink → confirms on closed→open sequence", () => {
    const fsm = new ActionStateMachine({ alignHoldMs: 1000 });
    const blinkSpy = vi.fn();
    fsm.onBlinkConfirmed(blinkSpy);

    fsm.beginPermission(0);
    fsm.permissionGranted();
    expect(fsm.getState()).toBe("aligning");

    // Align for 1s to cross ALIGN_HOLD.
    fsm.feed(frame(100));
    expect(fsm.getState()).toBe("align_hold");
    fsm.feed(frame(600));
    expect(fsm.getState()).toBe("align_hold");
    fsm.feed(frame(1200));
    // After the hold window closes, FSM transitions through blink_prompt
    // to blink_detecting in a single feed.
    expect(fsm.getState()).toBe("blink_detecting");

    // Feed an EAR sequence that produces a closed→open transition.
    fsm.feed(frame(1260, { ear: 0.30 }));
    fsm.feed(frame(1320, { ear: 0.15 }));
    fsm.feed(frame(1380, { ear: 0.14 }));
    fsm.feed(frame(1440, { ear: 0.28 }));

    expect(blinkSpy).toHaveBeenCalledTimes(1);
    expect(fsm.getState()).toBe("blink_confirmed");
  });

  it("markCaptured → beginUpload → uploadSucceeded reaches done", () => {
    const fsm = new ActionStateMachine();
    fsm.beginPermission(0);
    fsm.permissionGranted();
    // Force into blink_confirmed via normal happy path.
    fsm.feed(frame(0));
    fsm.feed(frame(1100));
    fsm.feed(frame(1200, { ear: 0.3 }));
    fsm.feed(frame(1260, { ear: 0.15 }));
    fsm.feed(frame(1320, { ear: 0.14 }));
    fsm.feed(frame(1380, { ear: 0.28 }));
    expect(fsm.getState()).toBe("blink_confirmed");

    fsm.markCaptured(1400);
    expect(fsm.getState()).toBe("captured");
    fsm.beginUpload();
    expect(fsm.getState()).toBe("uploading");
    fsm.uploadSucceeded();
    expect(fsm.getState()).toBe("done");
  });
});

describe("ActionStateMachine — timeout and retry", () => {
  it("fires onTimeout after session exceeds sessionTimeoutMs", () => {
    const fsm = new ActionStateMachine({ sessionTimeoutMs: 15000 });
    const timeoutSpy = vi.fn();
    fsm.onTimeout(timeoutSpy);
    fsm.beginPermission(0);
    fsm.permissionGranted();
    fsm.feed(frame(100));
    // Far in the future — trips timeout on the next feed.
    fsm.feed(frame(20000, { headPose: { yaw: 30, pitch: 0, roll: 0 } }));
    expect(timeoutSpy).toHaveBeenCalledTimes(1);
  });

  it("retries up to maxRetries then fails", () => {
    const fsm = new ActionStateMachine({
      sessionTimeoutMs: 1000,
      maxRetries: 2,
    });
    const exhaustedSpy = vi.fn();
    fsm.onRetryExhausted(exhaustedSpy);
    fsm.beginPermission(0);
    fsm.permissionGranted();

    fsm.feed(frame(100));
    fsm.feed(frame(2000, { headPose: { yaw: 30, pitch: 0, roll: 0 } })); // retry 1
    // After first retry the FSM is back in aligning with session start unchanged;
    // force another timeout.
    fsm.feed(frame(4000, { headPose: { yaw: 30, pitch: 0, roll: 0 } })); // retry 2
    fsm.feed(frame(6000, { headPose: { yaw: 30, pitch: 0, roll: 0 } })); // retry 3 → failed
    expect(fsm.getState() === "failed" || exhaustedSpy.mock.calls.length > 0).toBe(true);
  });
});
