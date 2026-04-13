import { describe, it, expect, vi, afterEach } from "vitest";
import { VideoPipeline } from "../../src/core/video-pipeline";
import {
  FakeMediaStream,
  FakeMediaStreamTrack,
} from "../fixtures/mock-media-stream";

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", originalDescriptor);
  }
});

function makeVideoEl(): HTMLVideoElement {
  const el = document.createElement("video");
  el.play = vi.fn().mockResolvedValue(undefined) as unknown as HTMLMediaElement["play"];
  return el;
}

function stubWithTracks(tracks: FakeMediaStreamTrack[]): { stream: FakeMediaStream } {
  const stream = new FakeMediaStream(tracks);
  Object.defineProperty(navigator, "mediaDevices", {
    value: {
      getUserMedia: async () => stream as unknown as MediaStream,
    },
    configurable: true,
    writable: true,
  });
  return { stream };
}

describe("VideoPipeline — AC12 track stop semantics", () => {
  it("flips every track's readyState to 'ended' on stop()", async () => {
    const tracks = [
      new FakeMediaStreamTrack({ kind: "video" }),
      new FakeMediaStreamTrack({ kind: "audio" }),
    ];
    stubWithTracks(tracks);
    const pipe = new VideoPipeline({ videoEl: makeVideoEl() });
    await pipe.start();
    expect(tracks.every((t) => t.readyState === "live")).toBe(true);
    pipe.stop();
    expect(tracks.every((t) => t.readyState === "ended")).toBe(true);
    for (const t of tracks) expect(t.stopCalls).toBe(1);
  });

  it("stop() is idempotent — second call does not re-invoke track.stop()", async () => {
    const track = new FakeMediaStreamTrack({ kind: "video" });
    stubWithTracks([track]);
    const pipe = new VideoPipeline({ videoEl: makeVideoEl() });
    await pipe.start();
    pipe.stop();
    pipe.stop();
    expect(track.stopCalls).toBe(1);
    expect(track.readyState).toBe("ended");
  });
});
