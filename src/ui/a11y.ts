// a11y.ts — Phase 8 장차법 준수 helpers shared by the camera UI.
//
// Responsibilities:
//   * Centralize Korean aria-label strings so the JSP shell, ui-controller
//     and manual-capture-fallback all stay in sync.
//   * Provide a small `announce()` helper that pushes a one-shot message
//     into the live region (`#help_text`) without blowing away the visual
//     copy that ui-controller manages.
//   * Provide a focus helper that screen-reader users can rely on at
//     state transitions.
//
// 2026-04-11 장차법 준수: aria-label, aria-live, keyboard navigation,
// 자동촬영 불가 사용자 대체 경로.

export const ARIA_LABELS = {
  capture: "얼굴촬영",
  captureManual: "얼굴촬영 (탭하여 촬영)",
  exit: "나가기",
  back: "뒤로 가기",
} as const;

// Push a transient announcement into the aria-live region without
// permanently overwriting the visible help text. ui-controller still owns
// the long-form copy; this helper is for momentary cues like "촬영되었습니다".
export function announce(text: string, root: ParentNode = document): void {
  const live = root.querySelector<HTMLElement>("#help_text");
  if (!live) return;
  const previous = live.textContent ?? "";
  live.textContent = text;
  // Restore after enough time for VoiceOver / TalkBack to read it.
  setTimeout(() => {
    if (live.textContent === text) live.textContent = previous;
  }, 1500);
}

// Move focus to the named element. Used at state transitions so keyboard
// users land on the most relevant action without having to tab repeatedly.
export function moveFocus(
  selector: "#face_auto_capture" | "#btnClose" | "#unsupported_container",
  root: ParentNode = document,
): void {
  const el = root.querySelector<HTMLElement>(selector);
  if (!el) return;
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
}

// Apply the standard a11y attributes to the camera DOM. Idempotent — safe
// to call after the JSP shell mounts or after a hot module reload during
// dev. Used by ui-controller bootstrap when running outside the JSP.
export function ensureA11yAttributes(root: ParentNode = document): void {
  const help = root.querySelector<HTMLElement>("#help_text");
  if (help && help.getAttribute("aria-live") !== "polite") {
    help.setAttribute("aria-live", "polite");
    help.setAttribute("role", "status");
  }
  const btn = root.querySelector<HTMLElement>("#face_auto_capture");
  if (btn && !btn.getAttribute("aria-label")) {
    btn.setAttribute("aria-label", ARIA_LABELS.capture);
  }
  const exit = root.querySelector<HTMLElement>("#btnClose");
  if (exit && !exit.getAttribute("aria-label")) {
    exit.setAttribute("aria-label", ARIA_LABELS.exit);
  }
}
