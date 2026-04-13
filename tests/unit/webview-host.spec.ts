import { describe, it, expect, afterEach } from "vitest";
import {
  detectHost,
  isBnkGoodbankWebView,
  requiresInlinePlaybackConfig,
} from "../../src/core/webview-host";

const UA = {
  iosSafari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
  iosWkwebview:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148",
  androidChrome:
    "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36",
  androidWebview:
    "Mozilla/5.0 (Linux; Android 10; SM-G960F; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/83.0.4103.106 Mobile Safari/537.36",
  goodbankIos:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 goodbank/1.2",
  goodbankAndroid:
    "Mozilla/5.0 (Linux; Android 13; BNK/goodbank) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36",
};

const originalDescriptor = Object.getOwnPropertyDescriptor(navigator, "mediaDevices");

afterEach(() => {
  if (originalDescriptor) {
    Object.defineProperty(navigator, "mediaDevices", originalDescriptor);
  }
});

describe("detectHost", () => {
  it("classifies iOS Safari", () => {
    expect(detectHost(UA.iosSafari).kind).toBe("ios_safari");
  });
  it("classifies iOS WKWebView (no Safari token)", () => {
    expect(detectHost(UA.iosWkwebview).kind).toBe("ios_wkwebview");
  });
  it("classifies Android Chrome", () => {
    expect(detectHost(UA.androidChrome).kind).toBe("android_chrome");
  });
  it("classifies Android WebView (;wv) marker", () => {
    expect(detectHost(UA.androidWebview).kind).toBe("android_webview");
  });
  it("classifies BNK Goodbank on iOS", () => {
    expect(detectHost(UA.goodbankIos).kind).toBe("goodbank_app");
  });
  it("classifies BNK Goodbank on Android", () => {
    expect(detectHost(UA.goodbankAndroid).kind).toBe("goodbank_app");
  });
});

describe("isBnkGoodbankWebView", () => {
  it("matches goodbank tokens", () => {
    expect(isBnkGoodbankWebView(UA.goodbankIos)).toBe(true);
    expect(isBnkGoodbankWebView(UA.goodbankAndroid)).toBe(true);
  });
  it("rejects vanilla browsers", () => {
    expect(isBnkGoodbankWebView(UA.iosSafari)).toBe(false);
    expect(isBnkGoodbankWebView(UA.androidChrome)).toBe(false);
  });
});

describe("detectHost hasGetUserMedia", () => {
  it("reports false when navigator.mediaDevices is undefined", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: undefined,
      configurable: true,
      writable: true,
    });
    const det = detectHost(UA.androidWebview);
    expect(det.hasGetUserMedia).toBe(false);
  });

  it("reports true when getUserMedia exists", () => {
    Object.defineProperty(navigator, "mediaDevices", {
      value: { getUserMedia: async () => ({}) as MediaStream },
      configurable: true,
      writable: true,
    });
    const det = detectHost(UA.androidChrome);
    expect(det.hasGetUserMedia).toBe(true);
  });
});

describe("requiresInlinePlaybackConfig", () => {
  it("is true for iOS WKWebView and Goodbank app", () => {
    expect(requiresInlinePlaybackConfig("ios_wkwebview")).toBe(true);
    expect(requiresInlinePlaybackConfig("goodbank_app")).toBe(true);
  });
  it("is false for ordinary browsers", () => {
    expect(requiresInlinePlaybackConfig("ios_safari")).toBe(false);
    expect(requiresInlinePlaybackConfig("android_chrome")).toBe(false);
  });
});
