// unsupported-container.ts — Phase 8 fallback UI for hosts that cannot
// run getUserMedia (legacy WebViews, embedded browsers, etc.). Mounts the
// reserved `#unsupported_container` slot defined by the JSP shell and
// reuses the legacy `.btn_exit.outside_btn` look so the fallback feels
// native to the BNK styling.
//
// 2026-04-11 장차법 준수: aria-label 라벨링, 키보드 포커스 진입,
// 아이콘만의 안내가 아닌 텍스트 안내, 명확한 대체 경로 안내.
//
// The detector function is parameterized so unit tests can stub it.

import { detectHost, type HostDetection } from "../core/webview-host";

const DEFAULT_MESSAGE =
  "이 브라우저는 카메라를 지원하지 않습니다.\nBNK 모바일뱅킹 앱에서 이용해 주세요.";

export interface UnsupportedContainerOptions {
  rootEl?: HTMLElement;
  message?: string;
  exitLabel?: string;
  detect?: () => HostDetection;
  onExit?: () => void;
}

export interface UnsupportedContainerHandle {
  el: HTMLElement;
  hide(): void;
}

// Mounts the fallback only if the host cannot use the camera.
// Returns null when the host is supported (caller should proceed normally).
export function maybeMountUnsupportedContainer(
  opts: UnsupportedContainerOptions = {},
): UnsupportedContainerHandle | null {
  const detect = opts.detect ?? detectHost;
  const host = detect();
  if (host.hasGetUserMedia) return null;
  return mountUnsupportedContainer(opts);
}

export function mountUnsupportedContainer(
  opts: UnsupportedContainerOptions = {},
): UnsupportedContainerHandle {
  if (typeof document === "undefined") {
    throw new Error("unsupported-container requires a DOM environment");
  }
  const root = opts.rootEl ?? document.body;
  let el = root.querySelector<HTMLElement>("#unsupported_container");
  if (!el) {
    el = document.createElement("div");
    el.id = "unsupported_container";
    root.appendChild(el);
  }
  el.removeAttribute("hidden");
  el.style.display = "flex";
  el.setAttribute("role", "alertdialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-labelledby", "unsupported_container_text");
  el.innerHTML = "";

  const msg = document.createElement("p");
  msg.id = "unsupported_container_text";
  msg.className = "guide_text";
  msg.style.whiteSpace = "pre-line";
  msg.textContent = opts.message ?? DEFAULT_MESSAGE;
  el.appendChild(msg);

  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "btn_exit outside_btn";
  exit.style.position = "static";
  exit.style.marginTop = "16px";
  exit.setAttribute("aria-label", opts.exitLabel ?? "나가기");
  exit.textContent = opts.exitLabel ?? "나가기";
  exit.addEventListener("click", (ev) => {
    ev.preventDefault();
    opts.onExit?.();
  });
  exit.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" || ev.key === " " || ev.key === "Escape") {
      ev.preventDefault();
      opts.onExit?.();
    }
  });
  el.appendChild(exit);

  // Move focus to the exit button so keyboard / screen-reader users land
  // inside the dialog immediately.
  setTimeout(() => {
    try {
      exit.focus();
    } catch {
      /* focus is best-effort */
    }
  }, 0);

  const handle: UnsupportedContainerHandle = {
    el,
    hide() {
      el!.style.display = "none";
      el!.setAttribute("hidden", "");
    },
  };
  return handle;
}
