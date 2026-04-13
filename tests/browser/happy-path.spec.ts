// Phase 9 — browser smoke test.
//
// Loads the Vite dev host (`index.html`) in a headless Chromium launched
// with `--use-fake-device-for-media-stream` so getUserMedia succeeds without
// a physical camera. The fake stream won't contain a real face, so this
// test only verifies the end-to-end scaffolding works:
//   - the page loads without console errors
//   - the overlay canvas and inline video are present
//   - navigator.mediaDevices.getUserMedia is callable and returns a MediaStream
//
// A full capture→upload flow requires a real face and is covered by the
// integration specs (session-happy-path, reflection-rejection) that use
// stubbed collaborators.

import { test, expect } from "@playwright/test";

test.describe("Browser smoke — MW Camera dev host", () => {
  test("serves index.html with overlay canvas and a playable video element", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });

    await page.goto("/");

    await expect(page.locator("#overlay_canvas")).toBeVisible();
    await expect(page.locator(".video_wrapper video")).toHaveCount(1);

    // Confirm playsinline + autoplay attributes survived the dev host.
    const videoAttrs = await page.locator(".video_wrapper video").evaluate((el) => ({
      playsInline: el.hasAttribute("playsinline"),
      autoplay: el.hasAttribute("autoplay"),
    }));
    expect(videoAttrs.playsInline).toBe(true);
    expect(videoAttrs.autoplay).toBe(true);

    // Confirm getUserMedia is available and returns a MediaStream.
    const streamInfo = await page.evaluate(async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const tracks = stream.getVideoTracks().length;
      stream.getTracks().forEach((t) => t.stop());
      return { tracks };
    });
    expect(streamInfo.tracks).toBeGreaterThan(0);

    expect(consoleErrors, `console errors: ${consoleErrors.join("\n")}`).toHaveLength(0);
  });
});
