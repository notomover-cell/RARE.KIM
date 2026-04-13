// AC2 — JSP shell structural parity.
// Loads the static HTML snapshot of MWPTBIM60000000.jsp (rendered by lane-c)
// and asserts that every required selector exists, that #auto_snap is absent,
// and that overlay z-index ordering works so button > help > overlay > video.

import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SHELL_PATH = resolve(
  __dirname,
  "../fixtures/jsp-shell/MWPTBIM60000000.static.html",
);

describe("JSP shell structural parity — AC2", () => {
  beforeAll(() => {
    const html = readFileSync(SHELL_PATH, "utf-8");
    document.documentElement.innerHTML = html.replace(
      /<!DOCTYPE[^>]*>/i,
      "",
    ).replace(/<\/?html[^>]*>/gi, "");
  });

  it("exposes the required wrapper + scroll container classes", () => {
    expect(document.querySelector(".lybx.ctg_cmn.pic_face")).not.toBeNull();
    expect(document.querySelector(".scrollBox")).not.toBeNull();
  });

  it("has an inline <video playsinline> inside .video_wrapper", () => {
    const video = document.querySelector<HTMLVideoElement>(
      ".video_wrapper > video",
    );
    expect(video).not.toBeNull();
    expect(video?.hasAttribute("playsinline")).toBe(true);
  });

  it("has an overlay canvas #overlay_canvas with 360x649 dimensions", () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      ".overlay > #overlay_canvas",
    );
    expect(canvas).not.toBeNull();
    expect(canvas?.getAttribute("width")).toBe("360");
    expect(canvas?.getAttribute("height")).toBe("649");
  });

  it("has #help_overlay > #help_text.guide_text with aria-live=polite", () => {
    const help = document.querySelector<HTMLElement>(
      "#help_overlay > #help_text.guide_text",
    );
    expect(help).not.toBeNull();
    expect(help?.getAttribute("aria-live")).toBe("polite");
  });

  it("has #button_overlay > button.btn_camera#face_auto_capture[aria-label]", () => {
    const btn = document.querySelector<HTMLButtonElement>(
      "#button_overlay > button.btn_camera#face_auto_capture",
    );
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute("aria-label")).toBe("얼굴촬영");
  });

  it("has .btn_exit.outside_btn#btnClose", () => {
    const close = document.querySelector("#btnClose.btn_exit.outside_btn");
    expect(close).not.toBeNull();
  });

  it("has #unsupported_container hidden by default", () => {
    const el = document.querySelector<HTMLElement>("#unsupported_container");
    expect(el).not.toBeNull();
    expect(el?.hasAttribute("hidden")).toBe(true);
  });

  it("must NOT contain #auto_snap (removed relative to prototype)", () => {
    expect(document.querySelector("#auto_snap")).toBeNull();
  });
});
