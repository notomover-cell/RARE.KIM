// Phase 2 — getUserMedia lifecycle owner.
//
// VideoPipeline owns the single MediaStream for a camera session: it acquires
// the stream via navigator.mediaDevices.getUserMedia, wires it to the provided
// <video>, enforces `playsinline=true` for iOS inline playback (AC1), hooks
// the document `visibilitychange` lifecycle so suspend/resume work on Safari
// tab switches, and guarantees every track lands in `readyState === "ended"`
// on stop (AC12).
//
// Single-instance guard: concurrent start() calls return the same in-flight
// promise so double-binding from the FSM / React StrictMode cannot spawn a
// second permission prompt.

import {
  detectHost,
  requiresInlinePlaybackConfig,
  type HostDetection,
  type HostKind,
} from "./webview-host";

export interface VideoPipelineOptions {
  videoEl: HTMLVideoElement;
  facingMode?: "user" | "environment";
  idealWidth?: number;
  idealHeight?: number;
  onSuspend?: () => void;
  onResume?: () => Promise<void> | void;
  onPermissionDenied?: (err: DOMException) => void;
  onError?: (err: Error) => void;
}

export class VideoPipeline {
  private readonly opts: VideoPipelineOptions;
  private readonly host: HostDetection;
  private stream: MediaStream | null = null;
  private startInFlight: Promise<MediaStream> | null = null;
  private visibilityHandler: (() => void) | null = null;
  private started = false;
  private disposed = false;
  private permissionDeniedCb: ((err: DOMException) => void) | null = null;

  constructor(opts: VideoPipelineOptions) {
    this.opts = opts;
    this.host = detectHost();
    if (opts.onPermissionDenied) {
      this.permissionDeniedCb = opts.onPermissionDenied;
    }
  }

  isSupported(): boolean {
    if (!this.host.hasGetUserMedia) return false;
    // Android WebView without Chrome 83+ returns undefined mediaDevices and is
    // already filtered by hasGetUserMedia. For iOS WKWebView we rely on the
    // hosting app having set the inline playback flags documented in
    // webview-host.ts; there is no runtime probe for that config, so the
    // fallback path is triggered only when getUserMedia itself rejects.
    return true;
  }

  hostKind(): HostKind {
    return this.host.kind;
  }

  onPermissionDenied(cb: (err: DOMException) => void): void {
    this.permissionDeniedCb = cb;
  }

  async start(): Promise<MediaStream> {
    if (this.disposed) {
      throw new Error("VideoPipeline: start() called after stop() disposal");
    }
    if (this.stream && this.started) {
      return this.stream;
    }
    if (this.startInFlight) {
      return this.startInFlight;
    }

    const p = this.acquireStream();
    this.startInFlight = p;
    try {
      const stream = await p;
      return stream;
    } finally {
      this.startInFlight = null;
    }
  }

  private async acquireStream(): Promise<MediaStream> {
    if (!this.isSupported()) {
      const err = new Error(
        `VideoPipeline: host '${this.host.kind}' lacks getUserMedia`,
      );
      this.opts.onError?.(err);
      throw err;
    }

    const videoConstraints: MediaTrackConstraints = {
      facingMode: this.opts.facingMode ?? "user",
    };
    if (this.opts.idealWidth) {
      videoConstraints.width = { ideal: this.opts.idealWidth };
    }
    if (this.opts.idealHeight) {
      videoConstraints.height = { ideal: this.opts.idealHeight };
    }
    const constraints: MediaStreamConstraints = {
      audio: false,
      video: videoConstraints,
    };

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotAllowedError") {
        this.permissionDeniedCb?.(err);
      }
      const wrapped = err instanceof Error ? err : new Error(String(err));
      this.opts.onError?.(wrapped);
      throw wrapped;
    }

    this.stream = stream;
    this.attachToVideo(stream);
    this.registerVisibilityListener();
    this.started = true;
    return stream;
  }

  private attachToVideo(stream: MediaStream): void {
    const videoEl = this.opts.videoEl;
    // Enforce inline playback attributes required by iOS Safari / WKWebView.
    // `playsinline` is the modern attribute; older iOS needs `webkit-playsinline`.
    videoEl.setAttribute("playsinline", "true");
    videoEl.setAttribute("webkit-playsinline", "true");
    videoEl.playsInline = true;
    videoEl.muted = true;
    videoEl.autoplay = true;

    if (requiresInlinePlaybackConfig(this.host.kind)) {
      // Host-app assumptions enumerated in webview-host.ts. Nothing to do at
      // runtime besides set the attributes above — the configuration lives on
      // the native WKWebViewConfiguration side.
    }

    videoEl.srcObject = stream;
    // Play is best-effort; iOS Safari throws AbortError if the tab is hidden
    // at the moment of assignment, and that is recovered by the visibility
    // handler below.
    void videoEl.play().catch(() => {});
  }

  private registerVisibilityListener(): void {
    if (this.visibilityHandler) return;
    if (typeof document === "undefined") return;

    const handler = (): void => {
      if (document.visibilityState === "hidden") {
        this.suspendTracks();
      } else if (document.visibilityState === "visible") {
        void this.resume();
      }
    };
    this.visibilityHandler = handler;
    document.addEventListener("visibilitychange", handler);
  }

  private removeVisibilityListener(): void {
    if (!this.visibilityHandler) return;
    if (typeof document === "undefined") return;
    document.removeEventListener("visibilitychange", this.visibilityHandler);
    this.visibilityHandler = null;
  }

  private suspendTracks(): void {
    if (!this.stream) return;
    this.stopTracks(this.stream);
    this.stream = null;
    this.started = false;
    try {
      this.opts.videoEl.srcObject = null;
    } catch {
      // ignore
    }
    this.opts.onSuspend?.();
  }

  private async resume(): Promise<void> {
    if (this.started || this.startInFlight) return;
    if (this.disposed) return;
    if (this.opts.onResume) {
      await this.opts.onResume();
      return;
    }
    try {
      await this.start();
    } catch {
      // Errors surface through onError / onPermissionDenied already.
    }
  }

  private stopTracks(stream: MediaStream): void {
    for (const track of stream.getTracks()) {
      try {
        track.stop();
      } catch {
        // ignore per-track stop exceptions
      }
      if (track.readyState !== "ended") {
        // Browsers are required to flip readyState synchronously on stop().
        // If any track resists, surface it so the UI layer can force a reload.
        const err = new Error(
          `VideoPipeline: track ${track.kind} did not reach ended state`,
        );
        this.opts.onError?.(err);
      }
    }
  }

  stop(): void {
    this.removeVisibilityListener();
    if (this.stream) {
      this.stopTracks(this.stream);
      this.stream = null;
    }
    try {
      this.opts.videoEl.srcObject = null;
    } catch {
      // ignore
    }
    this.started = false;
    this.disposed = true;
    this.startInFlight = null;
  }
}
