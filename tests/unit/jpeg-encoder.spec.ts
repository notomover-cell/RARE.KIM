import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { encodeJpeg } from "../../src/core/jpeg-encoder";
import { fakeRingFrame } from "../fixtures/mock-image-bitmap";

// Minimal stand-in for a 2D context — only drawImage is exercised.
interface StubCtx {
  drawImage: (...args: unknown[]) => void;
}

const ORIGINAL_OFFSCREEN = (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;

function installFakeOffscreenCanvas(opts: {
  withConvertToBlob: boolean;
  drawImageThrows?: boolean;
}): { restore: () => void } {
  class FakeOffscreenCanvas {
    width: number;
    height: number;
    constructor(w: number, h: number) {
      this.width = w;
      this.height = h;
    }
    getContext(_type: string): StubCtx {
      return {
        drawImage: () => {
          if (opts.drawImageThrows) {
            throw new Error("drawImage failed");
          }
        },
      };
    }
  }
  if (opts.withConvertToBlob) {
    (FakeOffscreenCanvas.prototype as unknown as Record<string, unknown>).convertToBlob =
      async (): Promise<Blob> =>
        new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00])], { type: "image/jpeg" });
  }
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "OffscreenCanvas");
  Object.defineProperty(globalThis, "OffscreenCanvas", {
    value: FakeOffscreenCanvas,
    configurable: true,
    writable: true,
  });
  return {
    restore: () => {
      if (descriptor) {
        Object.defineProperty(globalThis, "OffscreenCanvas", descriptor);
      } else {
        delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
      }
    },
  };
}

function installFakeHtmlCanvas(opts: { drawImageThrows?: boolean } = {}): { restore: () => void } {
  const originalCreateElement = document.createElement.bind(document);
  const stub = vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "canvas") return originalCreateElement(tag);
    const canvas: Record<string, unknown> = {
      width: 0,
      height: 0,
      getContext: (_type: string): StubCtx => ({
        drawImage: () => {
          if (opts.drawImageThrows) {
            throw new Error("drawImage failed (html)");
          }
        },
      }),
      toBlob: (cb: (blob: Blob | null) => void) => {
        cb(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/jpeg" }));
      },
    };
    return canvas as unknown as HTMLCanvasElement;
  }) as typeof document.createElement);
  return {
    restore: () => {
      stub.mockRestore();
    },
  };
}

afterEach(() => {
  if (ORIGINAL_OFFSCREEN === undefined) {
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
  } else {
    Object.defineProperty(globalThis, "OffscreenCanvas", {
      value: ORIGINAL_OFFSCREEN,
      configurable: true,
      writable: true,
    });
  }
});

describe("encodeJpeg — Path A (OffscreenCanvas.convertToBlob)", () => {
  it("returns an image/jpeg Blob and closes the RingFrame exactly once", async () => {
    const fake = installFakeOffscreenCanvas({ withConvertToBlob: true });
    try {
      const frame = fakeRingFrame({ width: 640, height: 360 });
      const blob = await encodeJpeg(frame, 0.85);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/jpeg");
      expect(blob.size).toBeGreaterThan(0);
      expect(frame.__fake.closeCalls).toBe(1);
    } finally {
      fake.restore();
    }
  });
});

describe("encodeJpeg — Path B (HTMLCanvasElement.toBlob fallback)", () => {
  it("falls back to toBlob when OffscreenCanvas.convertToBlob is undefined", async () => {
    const fakeOffscreen = installFakeOffscreenCanvas({ withConvertToBlob: false });
    const fakeHtml = installFakeHtmlCanvas();
    try {
      const frame = fakeRingFrame({ width: 640, height: 360 });
      const blob = await encodeJpeg(frame);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/jpeg");
      expect(blob.size).toBeGreaterThan(0);
      expect(frame.__fake.closeCalls).toBe(1);
    } finally {
      fakeHtml.restore();
      fakeOffscreen.restore();
    }
  });

  it("falls back when OffscreenCanvas is entirely undefined (iOS 15 UA stub)", async () => {
    delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
    const fakeHtml = installFakeHtmlCanvas();
    const prevUa = navigator.userAgent;
    Object.defineProperty(navigator, "userAgent", {
      value:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1",
      configurable: true,
    });
    try {
      const frame = fakeRingFrame();
      const blob = await encodeJpeg(frame);
      expect(blob.type).toBe("image/jpeg");
    } finally {
      Object.defineProperty(navigator, "userAgent", { value: prevUa, configurable: true });
      fakeHtml.restore();
    }
  });
});

describe("encodeJpeg — try/finally RingFrame.close guarantee (Rec D)", () => {
  it("still closes bestFrame when drawImage throws inside Path A", async () => {
    const fake = installFakeOffscreenCanvas({
      withConvertToBlob: true,
      drawImageThrows: true,
    });
    try {
      const frame = fakeRingFrame();
      await expect(encodeJpeg(frame)).rejects.toThrow(/drawImage failed/);
      expect(frame.__fake.closeCalls).toBe(1);
    } finally {
      fake.restore();
    }
  });

  it("still closes bestFrame when drawImage throws inside Path B", async () => {
    const fakeOffscreen = installFakeOffscreenCanvas({ withConvertToBlob: false });
    const fakeHtml = installFakeHtmlCanvas({ drawImageThrows: true });
    try {
      const frame = fakeRingFrame();
      await expect(encodeJpeg(frame)).rejects.toThrow(/drawImage failed \(html\)/);
      expect(frame.__fake.closeCalls).toBe(1);
    } finally {
      fakeHtml.restore();
      fakeOffscreen.restore();
    }
  });
});
