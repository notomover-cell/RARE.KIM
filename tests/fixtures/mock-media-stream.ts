// Fake MediaStream + MediaStreamTrack used by the integration tests. Avoids
// relying on jsdom's partial Media APIs and lets us drive a scripted frame
// sequence through VideoPipeline / CameraModule without spinning up a real
// camera.

export interface FakeTrackOptions {
  kind?: "video" | "audio";
}

export class FakeMediaStreamTrack {
  readonly kind: "video" | "audio";
  readonly id: string;
  readyState: "live" | "ended" = "live";
  enabled = true;
  muted = false;
  stopCalls = 0;

  constructor(opts: FakeTrackOptions = {}) {
    this.kind = opts.kind ?? "video";
    this.id = `fake-${this.kind}-${Math.random().toString(16).slice(2, 8)}`;
  }

  stop(): void {
    this.stopCalls += 1;
    this.readyState = "ended";
  }
}

export class FakeMediaStream {
  readonly id: string;
  private tracks: FakeMediaStreamTrack[];

  constructor(tracks: FakeMediaStreamTrack[] = [new FakeMediaStreamTrack()]) {
    this.id = `fake-stream-${Math.random().toString(16).slice(2, 8)}`;
    this.tracks = tracks;
  }

  getTracks(): FakeMediaStreamTrack[] {
    return this.tracks.slice();
  }
  getVideoTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === "video");
  }
  getAudioTracks(): FakeMediaStreamTrack[] {
    return this.tracks.filter((t) => t.kind === "audio");
  }
  addTrack(t: FakeMediaStreamTrack): void {
    this.tracks.push(t);
  }
  removeTrack(t: FakeMediaStreamTrack): void {
    this.tracks = this.tracks.filter((x) => x !== t);
  }
}

/**
 * Replace `navigator.mediaDevices.getUserMedia` with a stub that resolves
 * to a FakeMediaStream with a single video track. Returns a cleanup fn.
 */
export function stubGetUserMediaOK(): {
  stream: FakeMediaStream;
  track: FakeMediaStreamTrack;
  restore: () => void;
} {
  const track = new FakeMediaStreamTrack({ kind: "video" });
  const stream = new FakeMediaStream([track]);
  const original = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  const md = {
    getUserMedia: async () => stream as unknown as MediaStream,
    enumerateDevices: async () => [],
    getSupportedConstraints: () => ({} as MediaTrackSupportedConstraints),
  } as unknown as MediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    value: md,
    configurable: true,
    writable: true,
  });
  return {
    stream,
    track,
    restore: () => {
      Object.defineProperty(navigator, "mediaDevices", {
        value: original,
        configurable: true,
        writable: true,
      });
    },
  };
}

/** Force getUserMedia to reject with a NotAllowedError DOMException. */
export function stubGetUserMediaDenied(): { restore: () => void } {
  const original = (navigator as unknown as { mediaDevices?: MediaDevices }).mediaDevices;
  const err = new DOMException("Permission denied", "NotAllowedError");
  const md = {
    getUserMedia: async () => {
      throw err;
    },
    enumerateDevices: async () => [],
    getSupportedConstraints: () => ({} as MediaTrackSupportedConstraints),
  } as unknown as MediaDevices;
  Object.defineProperty(navigator, "mediaDevices", {
    value: md,
    configurable: true,
    writable: true,
  });
  return {
    restore: () => {
      Object.defineProperty(navigator, "mediaDevices", {
        value: original,
        configurable: true,
        writable: true,
      });
    },
  };
}
