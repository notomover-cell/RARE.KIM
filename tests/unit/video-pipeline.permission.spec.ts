import { describe, it, expect, vi, afterEach } from "vitest";
import { VideoPipeline } from "../../src/core/video-pipeline";
import { stubGetUserMediaDenied } from "../fixtures/mock-media-stream";

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", originalDescriptor);
  }
});

function makeVideoEl(): HTMLVideoElement {
  const el = document.createElement("video");
  // jsdom does not implement HTMLMediaElement.play — stub it so
  // VideoPipeline.attachToVideo does not reject.
  el.play = vi.fn().mockResolvedValue(undefined) as unknown as HTMLMediaElement["play"];
  return el;
}

describe("VideoPipeline — AC11 permission denied", () => {
  it("invokes onPermissionDenied with the DOMException and rejects start()", async () => {
    const { restore } = stubGetUserMediaDenied();
    try {
      const onPermissionDenied = vi.fn();
      const onError = vi.fn();
      const pipe = new VideoPipeline({
        videoEl: makeVideoEl(),
        onPermissionDenied,
        onError,
      });
      // Note: real browsers reject with the original DOMException, but jsdom's
      // DOMException does not extend Error, so VideoPipeline's `err instanceof
      // Error ? err : new Error(String(err))` fallback wraps it into an Error
      // in this environment. AC11 contract only mandates the callback payload
      // type, so we assert the rejection occurred and check the payload here.
      await expect(pipe.start()).rejects.toThrow();
      expect(onPermissionDenied).toHaveBeenCalledTimes(1);
      const arg = onPermissionDenied.mock.calls[0][0] as DOMException;
      expect(arg).toBeInstanceOf(DOMException);
      expect(arg.name).toBe("NotAllowedError");
      // onError also fires for every failure path.
      expect(onError).toHaveBeenCalledTimes(1);
    } finally {
      restore();
    }
  });

  it("accepts an after-the-fact callback registration via onPermissionDenied()", async () => {
    const { restore } = stubGetUserMediaDenied();
    try {
      const pipe = new VideoPipeline({ videoEl: makeVideoEl() });
      const cb = vi.fn();
      pipe.onPermissionDenied(cb);
      await expect(pipe.start()).rejects.toThrow();
      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb.mock.calls[0][0]).toBeInstanceOf(DOMException);
    } finally {
      restore();
    }
  });
});
