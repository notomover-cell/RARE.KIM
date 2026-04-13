// WebView / browser host detection for the MW Camera module.
//
// Background (Phase 2, Major #4 / Invariant I-2):
// The module must run across iOS Safari, Android Chrome, and embedded WebViews
// including the BNK 굿뱅크 (Goodbank) hosting app. `getUserMedia` availability
// and inline playback rules differ per host, and the detection result drives
// the `#unsupported_container` fallback path required by AC11 and
// ANALYSIS.md line 121.
//
// iOS WKWebView assumptions (MUST be met by the embedding app):
//   - `WKWebViewConfiguration.allowsInlineMediaPlayback = true`
//   - `WKWebViewConfiguration.mediaTypesRequiringUserActionForPlayback = []`
//   - iOS 14.3+ (first WKWebView version exposing `getUserMedia`)
// If the host app omits these, camera playback falls back to the fullscreen
// native player or fails outright; there is no client-side workaround, so
// `isSupported()` will degrade to false and the fallback UI takes over.
//
// Android WebView: `getUserMedia` is reliable from Chrome 83+. Earlier System
// WebView builds return undefined `mediaDevices`, handled the same way.

export type HostKind =
  | "ios_safari"
  | "android_chrome"
  | "ios_wkwebview"
  | "android_webview"
  | "goodbank_app"
  | "other";

export interface HostDetection {
  kind: HostKind;
  hasGetUserMedia: boolean;
}

const BNK_APP_TOKENS = /(BNK|goodbank|GoodBank|busanbank)/;

function currentUserAgent(ua?: string): string {
  if (typeof ua === "string") return ua;
  if (typeof navigator !== "undefined" && typeof navigator.userAgent === "string") {
    return navigator.userAgent;
  }
  return "";
}

function runtimeHasGetUserMedia(): boolean {
  if (typeof navigator === "undefined") return false;
  const md = navigator.mediaDevices as MediaDevices | undefined;
  return !!md && typeof md.getUserMedia === "function";
}

export function isBnkGoodbankWebView(ua?: string): boolean {
  return BNK_APP_TOKENS.test(currentUserAgent(ua));
}

function classifyFromUa(ua: string): HostKind {
  if (!ua) return "other";

  const isIos = /iPhone|iPad|iPod/.test(ua);
  const isAndroid = /Android/.test(ua);

  if (isIos) {
    if (isBnkGoodbankWebView(ua)) return "goodbank_app";
    const looksLikeWebView =
      /AppleWebKit/.test(ua) && /Mobile/.test(ua) && !/Safari/.test(ua);
    if (looksLikeWebView) return "ios_wkwebview";
    if (/Safari/.test(ua)) return "ios_safari";
    return "ios_wkwebview";
  }

  if (isAndroid) {
    if (isBnkGoodbankWebView(ua)) return "goodbank_app";
    if (/;\s*wv\)/.test(ua)) return "android_webview";
    if (/Chrome\//.test(ua)) return "android_chrome";
    return "android_webview";
  }

  return "other";
}

export function detectHost(ua?: string): HostDetection {
  const uaString = currentUserAgent(ua);
  const kind = classifyFromUa(uaString);
  return {
    kind,
    hasGetUserMedia: runtimeHasGetUserMedia(),
  };
}

export function requiresInlinePlaybackConfig(kind: HostKind): boolean {
  return kind === "ios_wkwebview" || kind === "goodbank_app";
}
