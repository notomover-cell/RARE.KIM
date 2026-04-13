// Phase 5 — Single-owner full-resolution frame ring buffer.
//
// Invariants enforced here:
//   I-5: RingFrame OWNS the full-resolution ImageBitmap. The bitmap that
//        BestCutScorer scores is the same object that the JPEG encoder
//        consumes — no thumbnails, no re-sampling, no video rewind.
//   I-7: Every eviction (capacity overflow OR explicit clear) calls close()
//        on the displaced frame's bitmap exactly once. detach() transfers
//        ownership out of the buffer without closing.
//
// Memory budget: capacity * RING_FRAME_WIDTH * RING_FRAME_HEIGHT * 4 bytes.
// At default 20 × 640×360 RGBA ≈ 18 MB. Exceeding RING_BUFFER_MAX_BYTES
// from a constructor argument is rejected at construction time.

import {
  RING_BUFFER_CAPACITY,
  RING_BUFFER_MAX_BYTES,
  RING_BYTES_PER_PIXEL,
  RING_FRAME_HEIGHT,
  RING_FRAME_WIDTH,
} from "../module/thresholds";

// Structural pose / face metrics shape — kept here so Phase 5 does not have
// a hard import dependency on Lane B's face-landmarker-runner.ts. Lane B's
// FaceLandmarkerRunner.detect() returns an object that satisfies this shape.
export interface HeadPose {
  yaw: number;
  pitch: number;
  roll: number;
}

export interface FaceBox {
  // Normalized 0..1 coordinates relative to the source video frame.
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameMetrics {
  timestamp: number;
  landmarks: ReadonlyArray<{ x: number; y: number; z?: number }> | null;
  headPose: HeadPose | null;
  ear: number | null;
  faceBox: FaceBox | null;
}

/**
 * Single-owner wrapper around a full-resolution ImageBitmap captured at
 * a specific point in the live MediaStream timeline.
 *
 * `close()` is idempotent — calling it twice is safe and only the first call
 * releases the underlying GPU texture. After close(), `closed === true` and
 * `fullBitmap` access is still allowed (it points at a closed handle) but
 * the encoder MUST not be invoked on a closed frame.
 */
export class RingFrame {
  readonly timestamp: number;
  readonly fullBitmap: ImageBitmap;
  readonly metrics: FrameMetrics;
  private _closed = false;

  constructor(args: {
    timestamp: number;
    fullBitmap: ImageBitmap;
    metrics: FrameMetrics;
  }) {
    this.timestamp = args.timestamp;
    this.fullBitmap = args.fullBitmap;
    this.metrics = args.metrics;
  }

  get closed(): boolean {
    return this._closed;
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    // ImageBitmap.close exists on all targets (iOS Safari 15+, Android Chrome).
    // Guard against test stubs that omit it.
    const bitmap = this.fullBitmap as ImageBitmap & { close?: () => void };
    if (typeof bitmap.close === "function") {
      try {
        bitmap.close();
      } catch {
        // ignore — close() is best-effort cleanup
      }
    }
  }
}

export interface RingBufferOptions {
  capacity?: number;
  estimatedFrameBytes?: number;
}

export class RingBuffer {
  readonly capacity: number;
  private readonly bytesPerFrame: number;
  private readonly frames: RingFrame[] = [];

  constructor(opts: RingBufferOptions = {}) {
    const capacity = opts.capacity ?? RING_BUFFER_CAPACITY;
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error(`RingBuffer: capacity must be a positive integer, got ${capacity}`);
    }
    const bytesPerFrame =
      opts.estimatedFrameBytes ??
      RING_FRAME_WIDTH * RING_FRAME_HEIGHT * RING_BYTES_PER_PIXEL;
    const projected = capacity * bytesPerFrame;
    if (projected > RING_BUFFER_MAX_BYTES) {
      throw new Error(
        `RingBuffer: projected memory ${projected} bytes exceeds budget ${RING_BUFFER_MAX_BYTES}`,
      );
    }
    this.capacity = capacity;
    this.bytesPerFrame = bytesPerFrame;
  }

  /** Current number of buffered frames. */
  size(): number {
    return this.frames.length;
  }

  /**
   * Append a frame. If the buffer is at capacity, the oldest frame is
   * evicted and its bitmap is closed (Invariant I-7).
   */
  push(frame: RingFrame): void {
    if (this.frames.length >= this.capacity) {
      const evicted = this.frames.shift();
      evicted?.close();
    }
    this.frames.push(frame);
  }

  /**
   * Returns frames whose timestamp is within ±halfSpan of centerTs.
   * Used by BestCutScorer to score the window around BLINK_CONFIRMED.
   */
  getWindow(centerTs: number, halfSpan: number): RingFrame[] {
    const lo = centerTs - halfSpan;
    const hi = centerTs + halfSpan;
    return this.frames.filter((f) => f.timestamp >= lo && f.timestamp <= hi);
  }

  /**
   * Shallow copy of the current frames for a scoring pass. Mutating the
   * returned array does not mutate the buffer; the RingFrame references
   * inside are still owned by the buffer.
   */
  snapshot(): RingFrame[] {
    return this.frames.slice();
  }

  /**
   * Remove `frame` from the buffer WITHOUT closing it. Used to transfer
   * ownership to the JPEG encoder for the winning best-cut frame.
   * Returns true if the frame was found and removed.
   */
  detach(frame: RingFrame): boolean {
    const idx = this.frames.indexOf(frame);
    if (idx < 0) return false;
    this.frames.splice(idx, 1);
    return true;
  }

  /**
   * Drop all frames, calling close() on each (Constraint 10 / AC13).
   * Idempotent.
   */
  clear(): void {
    while (this.frames.length > 0) {
      const f = this.frames.pop();
      f?.close();
    }
  }

  /** Worst-case bytes if the buffer is full. Used as a design-time guard. */
  estimatedBytes(): number {
    return this.capacity * this.bytesPerFrame;
  }
}
