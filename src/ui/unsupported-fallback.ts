// Phase 2 — #unsupported_container fallback UI activator.
//
// The CSS contract in ANALYSIS.md (lines 74-77, 121) reserves
// `#unsupported_container` as the full-screen slot shown when the host lacks
// `getUserMedia`. This helper populates and toggles the slot so Phase 7 CSS
// parity lights it up immediately without additional JS.

export interface UnsupportedFallbackOptions {
  rootEl?: HTMLElement;          // container to search within (default: document.body)
  message?: string;              // override user-facing Korean message
  onDismiss?: () => void;        // fired when user taps "이전 페이지" (AC11)
}

const DEFAULT_MESSAGE =
  "사용 중인 앱/브라우저에서 카메라 기능을 사용할 수 없습니다.\n다른 환경에서 다시 시도해 주세요.";

export function showUnsupportedFallback(
  opts: UnsupportedFallbackOptions = {},
): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const root = opts.rootEl ?? document.body;
  if (!root) return null;

  let el = root.querySelector<HTMLElement>("#unsupported_container");
  if (!el) {
    el = document.createElement("div");
    el.id = "unsupported_container";
    root.appendChild(el);
  }

  el.innerHTML = "";
  const msg = document.createElement("p");
  msg.className = "guide_text";
  msg.textContent = opts.message ?? DEFAULT_MESSAGE;
  el.appendChild(msg);

  const back = document.createElement("button");
  back.type = "button";
  back.className = "btn_exit outside_btn";
  back.setAttribute("aria-label", "이전 페이지로 돌아가기");
  back.textContent = "이전 페이지";
  back.addEventListener("click", () => {
    opts.onDismiss?.();
  });
  el.appendChild(back);

  el.style.display = "block";
  return el;
}

export function hideUnsupportedFallback(rootEl?: HTMLElement): void {
  if (typeof document === "undefined") return;
  const root = rootEl ?? document.body;
  const el = root?.querySelector<HTMLElement>("#unsupported_container");
  if (el) el.style.display = "none";
}
