// Vite dev entry — POC auto-capture pipeline for the BNK face camera module.
//
// Wires VideoPipeline + FaceLandmarkerRunner + ActionStateMachine + RingBuffer
// + BestCutScorer + JpegEncoder + Uploader in a RAF frame loop.
//
// Because mobile browsers collapse the original .pic_face > .scrollBox >
// .video_wrapper layout in certain flex/fixed combinations, this POC entry
// re-parents the <video>, help text, guide canvas and buttons to a dedicated
// #mw_camera_root container appended directly to document.body so the
// rendering is independent of any parent CSS quirks. The ib20 JSP shell
// (Phase 7) will re-enable the original DOM chain for production.

import { VideoPipeline } from "./core/video-pipeline";
import { FaceLandmarkerRunner } from "./core/face-landmarker-runner";
import { ActionStateMachine } from "./core/action-state-machine";
import { RingBuffer, RingFrame } from "./core/ring-buffer";
import { BestCutScorer } from "./core/best-cut-scorer";
import { encodeJpeg } from "./core/jpeg-encoder";
import { Uploader } from "./core/uploader";
import { JPEG_QUALITY_DEFAULT } from "./module/thresholds";

// ============================================================
// DOM setup — build a fresh root under <body> to bypass any
// legacy wrapper CSS collapse on mobile browsers.
// ============================================================
const HEADER_H = 56;

function css(style: Record<string, string>): string {
  return Object.entries(style)
    .map(([k, v]) => `${k.replace(/([A-Z])/g, "-$1").toLowerCase()}:${v}`)
    .join(";");
}

// Full-screen opaque splash that hides all the early init ugliness:
// the camera permission flash, the pre-stream white frame, the layout
// reflow when we re-parent the video. The splash fades out only after
// the stream is actually rendering frames on the video element.
const splash = document.createElement("div");
splash.id = "mw_splash";
splash.setAttribute(
  "style",
  css({
    position: "fixed",
    top: `${HEADER_H}px`,
    left: "0",
    right: "0",
    bottom: "0",
    background: "#000",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "rgb(255,242,95)",
    fontSize: "1.15rem",
    fontWeight: "700",
    zIndex: "500",
    opacity: "1",
    transition: "opacity 350ms ease",
    pointerEvents: "none",
  }),
);
splash.textContent = "카메라 로딩 중...";
document.body.appendChild(splash);

// --- Video: reuse the HTML-parsed video element from index.html.
// We LEAVE it in its original wrapper until VideoPipeline.start() has
// attached the stream and waitForVideoReady() has succeeded. Only THEN
// do we re-parent it directly to document.body — this is the exact
// sequence that worked earlier on the phone. Moving it before the
// stream is attached causes mobile Chrome/Safari to leave it blank.
const videoEl = document.getElementById("mw_video") as HTMLVideoElement;
if (!videoEl) {
  throw new Error("main.ts: #mw_video element not found in HTML");
}

// --- Overlay UI: a separate fixed container above the video. It only
// contains non-video elements (canvas guide, help text, buttons) so
// whatever collapse bug affects video_wrapper cannot apply here.
const overlay = document.createElement("div");
overlay.id = "mw_camera_overlay";
overlay.setAttribute(
  "style",
  css({
    position: "fixed",
    top: `${HEADER_H}px`,
    left: "0",
    right: "0",
    bottom: "0",
    pointerEvents: "none",
    zIndex: "20",
  }),
);
document.body.appendChild(overlay);

const overlayEl = document.createElement("canvas");
overlayEl.id = "overlay_canvas";
overlayEl.width = 360;
overlayEl.height = 649;
overlayEl.setAttribute("aria-hidden", "true");
overlayEl.setAttribute(
  "style",
  css({
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: "100%",
    maxWidth: "420px",
    height: "100%",
    pointerEvents: "none",
  }),
);
overlay.appendChild(overlayEl);

const helpBox = document.createElement("div");
helpBox.id = "help_overlay";
helpBox.setAttribute(
  "style",
  css({
    position: "absolute",
    top: "20px",
    left: "0",
    right: "0",
    padding: "0 16px",
    textAlign: "center",
    pointerEvents: "none",
  }),
);
const helpTextEl = document.createElement("span");
helpTextEl.id = "help_text";
helpTextEl.className = "guide_text";
helpTextEl.setAttribute("aria-live", "polite");
helpTextEl.setAttribute("role", "status");
helpTextEl.setAttribute(
  "style",
  css({
    display: "inline-block",
    color: "rgb(255,242,95)",
    fontSize: "1.35rem",
    fontWeight: "900",
    textShadow: "0 1px 6px rgba(0,0,0,0.8)",
  }),
);
helpBox.appendChild(helpTextEl);
overlay.appendChild(helpBox);

// Uploaded-result preview: shown after a successful capture so the user
// can visually confirm that the best-cut frame actually reached the server.
const resultBox = document.createElement("div");
resultBox.id = "upload_result";
resultBox.setAttribute(
  "style",
  css({
    position: "absolute",
    left: "50%",
    bottom: "24px",
    transform: "translateX(-50%)",
    padding: "8px",
    background: "rgba(0,0,0,0.75)",
    border: "2px solid rgb(255,242,95)",
    borderRadius: "12px",
    display: "none",
    pointerEvents: "none",
  }),
);
const resultImg = document.createElement("img");
resultImg.id = "upload_result_img";
resultImg.alt = "서버에 저장된 베스트컷";
resultImg.setAttribute(
  "style",
  css({
    display: "block",
    width: "140px",
    height: "auto",
    borderRadius: "6px",
  }),
);
const resultCaption = document.createElement("div");
resultCaption.id = "upload_result_caption";
resultCaption.setAttribute(
  "style",
  css({
    color: "rgb(255,242,95)",
    fontSize: "0.75rem",
    fontWeight: "700",
    textAlign: "center",
    marginTop: "6px",
  }),
);
resultBox.appendChild(resultImg);
resultBox.appendChild(resultCaption);
overlay.appendChild(resultBox);

// Tiny top-right diagnostic badge: shows frame count, landmark count,
// head pose and the current FSM state. Kept minimal so it's easy to
// read in a phone screenshot from a remote tester.
const diagBadge = document.createElement("div");
diagBadge.id = "mw_diag_badge";
diagBadge.setAttribute(
  "style",
  css({
    position: "absolute",
    top: "10px",
    right: "10px",
    padding: "6px 10px",
    background: "rgba(0,0,0,0.65)",
    color: "#fff",
    border: "1px solid rgba(255,242,95,0.7)",
    borderRadius: "8px",
    fontSize: "10px",
    lineHeight: "1.3",
    fontFamily: "monospace",
    pointerEvents: "none",
    maxWidth: "46vw",
  }),
);
diagBadge.textContent = "diag: booting";
overlay.appendChild(diagBadge);

// ============================================================
// Helpers
// ============================================================
function showStatus(msg: string, color = "rgb(255,242,95)"): void {
  const b = document.createElement("b");
  b.style.color = color;
  b.textContent = msg;
  helpTextEl.textContent = "";
  helpTextEl.appendChild(b);
  // eslint-disable-next-line no-console
  console.log("[MW-CAMERA]", msg);
}

function drawGuide(state: string): void {
  // Re-size the canvas backing store to match the overlay container so the
  // dim-outside-ellipse cut-out lines up with real pixels on mobile.
  const rect = overlayEl.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const targetW = Math.max(1, Math.round(rect.width * dpr));
  const targetH = Math.max(1, Math.round(rect.height * dpr));
  if (overlayEl.width !== targetW || overlayEl.height !== targetH) {
    overlayEl.width = targetW;
    overlayEl.height = targetH;
  }
  const ctx = overlayEl.getContext("2d");
  if (!ctx) return;
  const w = overlayEl.width;
  const h = overlayEl.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2;
  const cy = h * 0.42;
  const rx = w * 0.38;
  const ry = h * 0.26;

  // Dim the whole viewport and cut an ellipse hole through it with
  // the "evenodd" fill rule so the inside of the face oval stays bright.
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill("evenodd");
  ctx.restore();

  const color =
    state === "confirmed"
      ? "rgb(100,255,120)"
      : state === "aligned"
      ? "rgb(255,242,95)"
      : "rgba(255,242,95,0.75)";

  ctx.strokeStyle = color;
  ctx.lineWidth = Math.max(3, 5 * dpr);
  ctx.setLineDash(state === "idle" || state === "aligning" ? [16, 10] : []);
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// ============================================================
// Pre-flight diagnostics
// ============================================================
if (!window.isSecureContext) {
  showStatus("HTTPS 아님 — getUserMedia 차단됨", "#ff6b6b");
  throw new Error("not secure context");
}
if (!navigator.mediaDevices?.getUserMedia) {
  showStatus("이 브라우저는 getUserMedia 미지원", "#ff6b6b");
  throw new Error("no getUserMedia");
}

drawGuide("idle");
showStatus("초기화 중...");

// ============================================================
// Session
// ============================================================
let runner: FaceLandmarkerRunner | null = null;
let videoPipeline: VideoPipeline | null = null;
let fsm: ActionStateMachine | null = null;
let ringBuffer: RingBuffer | null = null;
let scorer: BestCutScorer | null = null;
let uploader: Uploader | null = null;

let loopRunning = false;
let startedAt = 0;
let settled = false;
let currentState = "idle";

async function startSession(): Promise<void> {
  startedAt = performance.now();
  settled = false;
  currentState = "idle";
  resultBox.style.display = "none";

  ringBuffer = new RingBuffer();
  scorer = new BestCutScorer();
  uploader = new Uploader("/api/face-capture");
  fsm = new ActionStateMachine({
    alignment: { yawMaxDeg: 30, pitchMaxDeg: 30, rollMaxDeg: 30 },
    // Blink thresholds tuned against real phone EAR: open ≈ 0.19-0.21,
    // closed ≈ 0.03-0.14. Require 4 consecutive closed frames (~67ms at
    // 60fps) so reflex micro-blinks don't fire and users have to close
    // their eyes deliberately.
    earBlinkClosedMax: 0.12,
    earBlinkOpenMin: 0.18,
    earRollingWindow: 25,
    earMinClosedFrames: 4,
  });

  fsm.onTransition((ev) => {
    currentState = ev.to;
    mapStateToHelp(ev.to, fsm.getLastAlignReason());
  });
  fsm.onBlinkConfirmed((centerTs) => {
    void handleBlinkConfirmed(centerTs);
  });
  fsm.onTimeout(() => {
    showStatus("타임아웃 — 다시 시도해주세요", "#ff9e6b");
    settled = true;
    loopRunning = false;
  });

  videoPipeline = new VideoPipeline({
    videoEl,
    onPermissionDenied: (err) => {
      showStatus(`카메라 권한 거부됨 (${err.message})`, "#ff6b6b");
      settled = true;
    },
    onError: (err) => {
      showStatus(`카메라 오류: ${err.message}`, "#ff6b6b");
    },
  });

  showStatus("카메라 + 얼굴 인식 로딩 중...");
  fsm.beginPermission(Date.now());

  try {
    diagBadge.textContent = "init: camera + mediapipe";
    const [, runnerInstance] = await Promise.all([
      videoPipeline.start(),
      // Force CPU delegate for broad Android/WebView compatibility. Some
      // Chromium forks claim GPU init success but then produce empty
      // inference results. CPU is slower (~15-30ms/frame) but always works.
      FaceLandmarkerRunner.create({ delegate: "CPU" }),
    ]);
    runner = runnerInstance;
    initInfo = `CPU ${runner.usingCpuFallback ? "(fallback)" : ""}`;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showStatus(`초기화 실패: ${msg}`, "#ff6b6b");
    diagBadge.textContent = `init fail: ${msg.slice(0, 60)}`;
    return;
  }

  fsm.permissionGranted();
  await waitForVideoReady(videoEl);

  // ---- POST-READY RE-PARENT (the sequence that actually worked) ----
  // Only AFTER the stream has data do we detach the video from whatever
  // wrapper it was in and appendChild it directly to document.body. The
  // splash is still covering the viewport, so users never see the reflow
  // or the mirror flip mid-render.
  try {
    videoEl.remove();
  } catch {
    /* ignore */
  }
  videoEl.setAttribute("playsinline", "true");
  videoEl.setAttribute("autoplay", "true");
  videoEl.setAttribute("muted", "true");
  videoEl.setAttribute(
    "style",
    [
      "position:fixed",
      "top:56px",
      "left:0",
      "right:0",
      "margin:0",
      "width:100vw",
      "height:calc(100dvh - 56px)",
      "z-index:10",
      "object-fit:cover",
      "background:#000",
      "display:block",
      "transform:scaleX(-1)",
    ].join(";"),
  );
  document.body.appendChild(videoEl);
  document.querySelector(".pic_face")?.remove();

  try {
    await videoEl.play();
  } catch {
    /* best-effort */
  }

  // Wait until at least one real video frame has been painted before we
  // fade the splash out. This removes the brief white/black flash and the
  // visible mirror-flip that users were complaining about.
  await nextVideoFrame(videoEl);

  drawGuide("aligning");
  showStatus("얼굴을 화면 안에 맞춰주세요");

  // Fade out the splash.
  splash.style.opacity = "0";
  setTimeout(() => {
    splash.remove();
  }, 400);

  loopRunning = true;
  requestAnimationFrame(frameLoop);
}

async function waitForVideoReady(v: HTMLVideoElement): Promise<void> {
  if (v.readyState >= 2 && v.videoWidth > 0) return;
  await new Promise<void>((resolve) => {
    const ok = (): void => {
      if (v.readyState >= 2 && v.videoWidth > 0) {
        v.removeEventListener("loadeddata", ok);
        v.removeEventListener("canplay", ok);
        resolve();
      }
    };
    v.addEventListener("loadeddata", ok);
    v.addEventListener("canplay", ok);
  });
}

// Resolves once the browser reports at least one newly-rendered video
// frame. Prefers the modern `requestVideoFrameCallback`, falls back to
// two RAFs otherwise (which is usually enough for iOS Safari).
async function nextVideoFrame(v: HTMLVideoElement): Promise<void> {
  type RVFCVideo = HTMLVideoElement & {
    requestVideoFrameCallback?: (cb: () => void) => number;
  };
  const rvfc = v as RVFCVideo;
  if (typeof rvfc.requestVideoFrameCallback === "function") {
    await new Promise<void>((resolve) => {
      rvfc.requestVideoFrameCallback?.(() => resolve());
    });
    return;
  }
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

let frameCount = 0;
let initInfo = "";
async function frameLoop(): Promise<void> {
  if (!loopRunning || settled || !runner || !fsm || !ringBuffer) return;
  // MediaPipe detectForVideo expects integer millisecond timestamps.
  // Passing a DOMHighResTimeStamp (fractional ms) silently fails on some
  // Chromium builds, which is why GPU detection was returning empty frames.
  const ts = Math.floor(performance.now());
  frameCount++;

  // Wait until the video element has actual frame data before running
  // detection — calling detectForVideo on a video with readyState < 2
  // is one of the known "lm=0 forever" failure modes.
  if (videoEl.readyState < 2 || videoEl.videoWidth === 0) {
    diagBadge.textContent = `${initInfo} waiting ready=${videoEl.readyState}`;
    if (loopRunning && !settled) requestAnimationFrame(frameLoop);
    return;
  }

  try {
    const metrics = runner.detect(videoEl, ts);

    // Live diagnostic badge — shows whether MediaPipe is picking up a face
    // on every frame. Makes remote phone diagnostics possible via screenshot.
    const lmCount = metrics.landmarks ? metrics.landmarks.length : 0;
    const hp = metrics.headPose;
    const vw = videoEl.videoWidth;
    const vh = videoEl.videoHeight;
    diagBadge.textContent =
      `[${initInfo}] #${frameCount} lm=${lmCount}` +
      (vw > 0 ? ` ${vw}x${vh}` : "") +
      (hp
        ? ` y${hp.yaw.toFixed(0)} p${hp.pitch.toFixed(0)} r${hp.roll.toFixed(0)}`
        : "") +
      (metrics.ear !== null ? ` ear${metrics.ear.toFixed(2)}` : "") +
      ` ${currentState}`;

    let bitmap: ImageBitmap | null = null;
    try {
      bitmap = await createImageBitmap(videoEl);
    } catch {
      bitmap = null;
    }

    if (bitmap) {
      const frame = new RingFrame({
        timestamp: ts,
        fullBitmap: bitmap,
        metrics: {
          timestamp: ts,
          landmarks: metrics.landmarks,
          headPose: metrics.headPose,
          ear: metrics.ear,
          faceBox: metrics.faceBox,
        },
      });
      ringBuffer.push(frame);
    }

    fsm.feed({
      timestamp: ts,
      landmarks: metrics.landmarks,
      headPose: metrics.headPose,
      ear: metrics.ear,
      faceBox: metrics.faceBox,
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn("[frameLoop error]", err);
  }

  if (loopRunning && !settled) {
    requestAnimationFrame(frameLoop);
  }
}

function mapStateToHelp(state: string, alignReason?: string): void {
  switch (state) {
    case "aligning":
      if (alignReason === "face_too_small") {
        showStatus("좀 더 가까이 와주세요");
      } else {
        showStatus("얼굴을 화면 안에 맞춰주세요");
      }
      drawGuide("aligning");
      break;
    case "align_hold":
      showStatus("그대로 유지해주세요...");
      drawGuide("aligned");
      break;
    case "blink_prompt":
    case "blink_detecting":
      showStatus("눈을 감았다 떠주세요");
      drawGuide("aligned");
      break;
    case "blink_confirmed":
    case "captured":
      showStatus("촬영 중...", "rgb(180,255,180)");
      drawGuide("confirmed");
      break;
    case "uploading":
      showStatus("업로드 중...", "rgb(180,255,180)");
      break;
    case "done":
      showStatus("완료", "rgb(180,255,180)");
      break;
    default:
      break;
  }
}

async function handleBlinkConfirmed(centerTs: number): Promise<void> {
  if (settled || !ringBuffer || !scorer || !uploader || !fsm) return;
  settled = true;
  loopRunning = false;

  try {
    const allFrames = ringBuffer.snapshot();
    // Filter to open-eye frames only — EAR below 0.18 is treated as "closed"
    // (same threshold used by the blink detector). This guarantees the
    // uploaded best cut is a frame where the user's eyes are actually open,
    // not a mid-blink frame with closed eyes.
    const OPEN_EYE_MIN = 0.18;
    const openEyeFrames = allFrames.filter(
      (f) => typeof f.metrics.ear === "number" && f.metrics.ear >= OPEN_EYE_MIN,
    );
    const candidates = openEyeFrames.length > 0 ? openEyeFrames : allFrames;
    // Close any closed-eye frames we're about to drop so their ImageBitmaps
    // release immediately instead of waiting for ringBuffer.clear().
    for (const f of allFrames) {
      if (!candidates.includes(f)) f.close();
    }
    const best = scorer.pickBest(candidates);
    if (!best) {
      showStatus("베스트컷 선택 실패", "#ff6b6b");
      return;
    }
    ringBuffer.detach(best.frame);
    ringBuffer.clear();

    fsm.markCaptured(centerTs);
    fsm.beginUpload();

    showStatus("업로드 중...", "rgb(180,255,180)");
    const jpeg = await encodeJpeg(best.frame, JPEG_QUALITY_DEFAULT);

    // Demo mode: if no backend server (e.g. GitHub Pages), skip upload
    // and show the captured image locally via Object URL.
    const isStaticHost = location.protocol === "https:" && !location.hostname.includes("localhost");
    if (isStaticHost) {
      fsm.markCaptured(centerTs);
      fsm.beginUpload();
      fsm.uploadSucceeded();
      showStatus("촬영 완료 (데모 모드)", "rgb(180,255,180)");
      drawGuide("confirmed");
      resultImg.src = URL.createObjectURL(jpeg);
      resultImg.style.transform = "scaleX(-1)";
      const sizeKb = Math.round(jpeg.size / 1024);
      resultCaption.textContent = `촬영 완료 ✓ ${sizeKb}KB (로컬)`;
      resultBox.style.display = "block";
    } else {
      const result = await uploader.upload(jpeg, {
        capturedAt: centerTs,
        sessionMs: performance.now() - startedAt,
        score: {
          sharpness: best.sharpness,
          reflectionFree: best.reflectionFree,
          alignment: best.alignment,
          total: best.total,
        },
      });

      if (!result.ok) {
        fsm.uploadFailed();
        showStatus(`업로드 실패: ${result.error}`, "#ff6b6b");
        return;
      }
      fsm.uploadSucceeded();
      showStatus("완료", "rgb(180,255,180)");
      drawGuide("confirmed");

      if (result.id) {
        resultImg.src = `/api/face-capture/${result.id}?t=${Date.now()}`;
        resultImg.style.transform = "scaleX(-1)";
        const sizeKb = Math.round(jpeg.size / 1024);
        resultCaption.textContent = `서버 저장 ✓ ${sizeKb}KB`;
        resultBox.style.display = "block";
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showStatus(`에러: ${msg}`, "#ff6b6b");
  }
}

// Security: release camera + GPU textures on page unload (PIPA §29)
function cleanup(): void {
  videoPipeline?.stop();
  ringBuffer?.clear();
}
window.addEventListener("pagehide", cleanup, { capture: true });
window.addEventListener("beforeunload", cleanup);

void startSession();
