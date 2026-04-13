# Ralplan: 부산은행 모바일웹 액티브 라이브니스 카메라 모듈

- Status: REVISED iter3 (post-Critic ITERATE, Architect APPROVED iter2)
- Mode: `--direct` (requirements frozen by deep-interview; this plan addresses HOW only)
- Ambiguity at entry: 9.5% (spec line 6)
- Author: Planner (oh-my-claudecode)
- Date: 2026-04-11

---

## Iteration History

### Iteration 1 → NEEDS_ITERATION (Architect)
- **Critical #1**: Ring buffer stored thumbnails but plan claimed to "re-sample" original resolution at upload — physically impossible on live MediaStream. Scored frame ≠ uploaded frame. Breaks AC5/AC9.
- **Critical #2**: AC8 5-second budget cited only "splash perception" mitigation. No quantitative per-slot engineering budget. WASM cold-load alone can consume 1.2–2.5s on iOS Safari.
- **Major #3**: FSM `BLINK_DETECTING` had no invalidation back-edge — head tilt during blink could produce false positives.
- **Major #4**: 굿뱅크 WebView (actual production host) was deferred to follow-ups instead of being designed in.
- **Major #5**: AC9 unit test verified scorer math but not that the uploaded artifact is reflection-free.
- **Major #6**: Geometry contradiction — ellipse face guide while claiming "pixel parity" with rectangle-bracket reference.
- **Major #7**: No accessibility fallback for users who cannot blink on command (장차법 gap).
- **Major #8**: `#auto_snap` ID reuse justified by speculation despite ANALYSIS marking it as unresolved unknown.
- **Minor #9**: iOS Safari `visibilitychange` permission re-prompt unhandled.

### Iteration 2 → What changed
- **Phase 5 rewritten**: `RingFrame` now owns a full-resolution `ImageBitmap`; scoring runs on a cheap downscaled *view* derived at score-time from the SAME bitmap. `pickBest()` returns the actual bitmap that will be encoded. 18MB bounded memory budget with `close()` discipline.
- **Phase 6 rewritten**: `encodeJpeg(bestFrame)` now takes the owned `ImageBitmap`; no video-element rewind. Uploaded artifact IS the scored artifact.
- **NEW "Performance Budget" section** between Phase 1 and Phase 2: hard per-slot ms numbers summing to <5000ms, bottleneck identified, WASM bundled same-origin.
- **Phase 2 updated**: WebView (WKWebView / Android WebView) detection, `visibilitychange` stop/re-acquire handler, explicit parallelism with Phase 3 MediaPipe init.
- **Phase 3 updated**: WASM binaries bundled same-origin under `public/vendor/mediapipe/`, `Promise.all` with camera warmup.
- **Phase 4 updated**: FSM invalidation back-edges from `BLINK_DETECTING` to `ALIGNING` on alignment loss or face-lost ≥2 frames; EAR buffer clear on reset.
- **Phase 7 updated**: "pixel parity" language removed and restated as class/z-index/header/exit-button/brand-color parity; committed to ellipse face guide as intentional; button ID changed to `#face_auto_capture`.
- **Phase 8 updated**: Manual capture fallback mode after N blink retries or on assistive-tech signal — legacy manual button becomes the 장차법 compliance path.
- **Phase 9 updated**: Integration fixture for reflection-burst rejection at the **uploaded artifact** level; WebView UA stub test; FSM invalidation tests (head-tilt-during-blink, face-lost-mid-action).
- **Risks updated**: Risk #5 removed; Risk #1 now references Performance Budget as quantitative proof (not splash perception).
- **ADR updated**: New entry documenting iter2 fixes and Consequences addendum.
- Sources of truth:
  - Spec: `/Users/woochang/projects/MW_CAMERA/.omc/specs/deep-interview-mw-camera.md`
  - Reference analysis: `/Users/woochang/projects/MW_CAMERA/reference/existing-id-capture/ANALYSIS.md`
  - Raw reference assets: `/Users/woochang/projects/MW_CAMERA/reference/existing-id-capture/extracted/`

### Iteration 3 → What changed (post-Critic ITERATE)
Architect APPROVED iter2; Critic returned ITERATE with 3 Required fixes and 5 Recommended. All Required fixes are addressed; most Recommended items are folded in where trivially cheap. Locked decisions unchanged.

**Required fixes (MUST)**:
- **Req #1 (AC7 untested)** — Formalized `SessionResult` / `SessionError` types in `types.ts` (Phase 1 + Phase 6). New unit test `tests/unit/camera-module.callback.spec.ts` in Phase 9 exercises both `onComplete` (happy path, exactly-once, correct shape) and `onError` (typed error codes: `permission_denied` / `timeout` / `upload_failed` / `webview_unsupported`). AC7 now has explicit end-to-end coverage.
- **Req #2 (`convertToBlob` fallback)** — Promoted from inline comment to a formal Phase 6 acceptance sub-criterion. `encodeJpeg` signature section now shows explicit numbered-step branch logic (feature-detect → OffscreenCanvas path OR HTMLCanvasElement.toBlob path). New unit test `tests/unit/jpeg-encoder.spec.ts` in Phase 9 stubs both branches via `Object.defineProperty` and asserts a valid JPEG Blob in each. Target: iOS Safari 15.0 / 16.0 / 16.3 / 16.4+.
- **Req #3 (+5MB bundle threatens AC8)** — Replaced Risk #2 (playsinline — now solved, assertion lives in Phase 2) with **"+5MB vendor bundle threatens AC8 on cold cache"**. Mitigation is concrete: (1) `Cache-Control: public, max-age=31536000, immutable` on `/public/vendor/mediapipe/*`, (2) version-hashed filenames, (3) JSP `<link rel="preload">` for both WASM binary and model, (4) explicit lite-model downgrade trigger at S4 > 800ms, (5) Phase 10 warm-cache assertion via `Performance.getEntriesByType('resource')`.

**Recommended fixes (folded in)**:
- **Rec A (Risk #3 w2 clarity)** — Replaced vague "튜닝 가능" with concrete default 0.4:0.3:0.3, telemetry hook `lastScoreBreakdown`, tuning trigger (>5% false-reject), safe floor (w2 ≥ 0.2).
- **Rec B (AC2 DOM snapshot)** — Added `tests/unit/jsp-shell-parity.spec.ts` to Phase 9 asserting all required classes/IDs/z-index.
- **Rec C (AC11/AC12 unit tests)** — Added `tests/unit/video-pipeline.permission.spec.ts` and `tests/unit/video-pipeline.track-stop.spec.ts` to Phase 9.
- **Rec D (try/finally in encoder)** — `encodeJpeg` numbered-step skeleton now wraps the draw/encode block in try/finally so `bestFrame.close()` always runs.
- **Rec E (ring-buffer memory downgrade trigger)** — Phase 10 now contains a one-line decision rule: peak JS heap on iPhone SE > 60MB → downgrade `RingBuffer.capacity` from 20 to 12 and re-measure.

---

## RALPLAN-DR Summary

### Principles (5)
1. **Evidence over guess** — DOM/CSS/z-index/클래스 네이밍은 `ANALYSIS.md` lines 19–66, 68–127의 실측 증거를 그대로 답습한다. 추측으로 새 패턴을 만들지 않는다.
2. **POC 품질, 운영 이식성** — spec 기본값(line 118): JSP 헤더는 모의 정적 HTML, 핵심 카메라/라이브니스 로직은 운영 이식 가능 품질. 핵심 도메인 로직(ActionStateMachine, BestCutScorer, RingBuffer)은 프레임워크 비의존·테스트 가능하게 설계한다.
3. **메모리 휘발, 저장 금지** — spec Constraint 10(line 54): 영상/프레임은 메모리만, LocalStorage/IndexedDB 금지, 업로드 직후 참조 해제. 이것은 기능이 아니라 불변속성이다.
4. **접근성 먼저(장차법)** — `ANALYSIS.md` lines 60–64: 장차법 주석 컨벤션, aria-label, 가이드 텍스트 위치/문구 이력 관리. 단순한 라벨링이 아닌 설계 단계 요구.
5. **iOS Safari 15+ / Android Chrome 최신 2개 메이저만 1차 타겟** — spec Constraint 7(line 51). 불필요한 폴리필/레거시 경로를 배제하고 `playsinline`, `getUserMedia`, WASM, Canvas2D만 가정한다.

### Decision Drivers (top 3)
1. **AC1–AC15 전체 충족** — 특히 AC5(3축 가중합), AC9(빛반사 배제 검증), AC12(stream stop), AC13(메모리 휘발)은 설계가 해결해야 함.
2. **기존 `.pic_idcard` 페이지와의 시각·DOM 대칭** — 사용자 학습비용 0 수렴(spec line 66). 이것은 "비슷하게"가 아니라 "클래스·z-index·아웃라인·버튼 위치가 정확히 쌍둥이"여야 함.
3. **POC임에도 운영 이식 가능한 핵심 도메인 로직** — 번들 납품 형태(IIFE), Vanilla TS, 외부 의존성 최소화(spec line 46).

### Viable Options (≥2)

#### Option A — **Monolithic IIFE bundle + ESM-clean core (권장, 채택)**
- **설명**: `src/core/` 하위에 프레임워크 비의존 TS 모듈(RingBuffer, ActionStateMachine, BestCutScorer, Uploader 등)을 두고, `src/module/camera-module.ts`에서 `CameraModule.start(opts)` 전역 엔트리를 노출. Vite(개발) + esbuild IIFE(납품) 듀얼 빌드. MediaPipe는 CDN/WASM 동적 로드.
- **Pros**:
  - ib20/JSP에 `<script>` 한 줄로 편입(Constraint 2, line 46).
  - 코어는 ESM으로 unit test(Vitest)가 쉬움. 프레임워크 무관하므로 운영 이식 가능(Principle 2).
  - 번들 내부 해시·버전 쿼리(`?v=V...`) 규약(ANALYSIS line 230) 수용 용이.
- **Cons**:
  - 듀얼 빌드 구성 복잡도 약간 상승 (Vite + esbuild IIFE task).
  - MediaPipe WASM 동적 로드 시 첫 진입 지연(→ 스플래시로 흡수).

#### Option B — **단일 Vite ESM 번들 + `<script type="module">` 로드**
- **설명**: Vite 빌드 산출물을 `type="module"`로 삽입.
- **Pros**: 빌드 설정 단순, 트리 쉐이킹 자연스러움.
- **Cons**: ib20/JSP 공용 번들이 jQuery를 전역으로 로드하는 비모듈 환경(ANALYSIS line 207)에서 `type="module"` 혼용이 실무적으로 불편. 운영 납품 시 정적 파일만 올리는 관행과 어긋날 가능성. **2차 후보**.

#### Option C — **OpenCV.js 사용하여 선명도/빛반사 계산**
- **설명**: OpenCV.js로 Laplacian, threshold 연산.
- **Pros**: 검증된 알고리즘.
- **Cons**: 8~10MB WASM 추가 → 모바일 진입 지연 심각. spec Technical Context(line 134)는 명시적으로 "OpenCV.js 대비 경량화" 명시. **무효화**.

#### Option D — **동영상(MediaRecorder) 업로드 후 서버 베스트컷**
- **무효화 사유**: spec Constraint 6(line 50) + AC6(line 87) "단일 JPEG 1장" 고정. 범위 밖.

> **채택**: Option A. Option B는 ib20 관행 확인 후 폴백 후보. Option C/D는 spec에 의해 무효화.

---

## Implementation Plan

### Repository layout (tree)
```
/Users/woochang/projects/MW_CAMERA/
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── vite.config.ts
├── esbuild.bundle.mjs
├── vitest.config.ts
├── playwright.config.ts
├── .gitignore
├── README.md
├── index.html                              # dev host (Vite)
├── public/
│   └── resource/img/mwp/                   # 부산은행 아이콘 플레이스홀더 (가이드 브라켓 등)
│       ├── ico_face_01.png ~ ico_face_04.png (placeholder)
│       └── btn_camera.png (placeholder)
├── src/
│   ├── main.ts                             # dev 진입(브라우저에서 CameraModule.start 호출)
│   ├── module/
│   │   ├── camera-module.ts                # CameraModule.start(opts) public API
│   │   └── types.ts                        # CameraModuleOptions, SessionResult, SessionError, SessionErrorCode, UploadMeta
│   ├── core/
│   │   ├── video-pipeline.ts               # getUserMedia, MediaStream lifecycle
│   │   ├── face-landmarker-runner.ts       # MediaPipe FaceLandmarker wrapper
│   │   ├── action-state-machine.ts         # front-align → blink FSM
│   │   ├── ring-buffer.ts                  # last N frames (bitmap ref + metrics)
│   │   ├── best-cut-scorer.ts              # sharpness × reflection × alignment
│   │   ├── metrics/
│   │   │   ├── laplacian.ts                # Laplacian variance (sharpness)
│   │   │   ├── reflection.ts               # luminance histogram high-bin detector
│   │   │   ├── alignment.ts                # yaw/pitch/roll + guide box distance
│   │   │   └── ear.ts                      # Eye Aspect Ratio from landmarks
│   │   ├── uploader.ts                     # multipart JPEG POST /api/face-capture
│   │   └── jpeg-encoder.ts                 # Canvas.toBlob('image/jpeg', q)
│   ├── ui/
│   │   ├── overlay-renderer.ts             # #overlay_canvas draw (guide, text)
│   │   ├── guide-assets.ts                 # 가이드 타원/브라켓 좌표 (360×649 기준)
│   │   ├── help-text-controller.ts         # #help_text 동적 문구/위치
│   │   ├── retry-ui.ts                     # 타임아웃/재시도 표시
│   │   ├── unsupported-fallback.ts         # #unsupported_container 진입
│   │   └── a11y.ts                         # aria-label, live-region, 장차법 주석 유틸
│   ├── config/
│   │   ├── thresholds.ts                   # EAR, yaw/pitch/roll, w1:w2:w3, timeout
│   │   └── mediapipe.ts                    # WASM/모델 URL, runningMode
│   └── styles/
│       ├── pic-face.css                    # .lybx.ctg_cmn.pic_face 쌍둥이 CSS
│       └── camera-layout.css               # .video_wrapper/.overlay 레이어 (ANALYSIS 재현)
├── jsp-shell/
│   ├── MWPTBIM60000000.jsp                 # 실사 JSP 템플릿 (모의 헤더 + 컨테이너)
│   └── mock-header.html                    # 공용 bnk-new-2023 헤더 모사본
├── server/
│   ├── src/
│   │   ├── index.ts                        # Express app
│   │   ├── routes/face-capture.ts          # POST /api/face-capture (multipart)
│   │   └── storage.ts                      # uploads/ 디스크 저장 + metadata json
│   ├── uploads/                            # .gitignore
│   ├── tsconfig.json
│   └── package.json (workspace)
├── tests/
│   ├── unit/
│   │   ├── ring-buffer.spec.ts
│   │   ├── laplacian.spec.ts
│   │   ├── reflection.spec.ts
│   │   ├── alignment.spec.ts
│   │   ├── ear.spec.ts
│   │   ├── best-cut-scorer.spec.ts
│   │   └── action-state-machine.spec.ts
│   ├── integration/
│   │   └── session-happy-path.spec.ts      # MediaStream + FaceLandmarker mocked
│   ├── fixtures/
│   │   ├── synthetic-frames/               # sharp.png, blurry.png, reflection.png
│   │   └── landmark-streams/               # *.json (pre-recorded EAR curves, poses)
│   └── browser/
│       └── happy-path.spec.ts              # Playwright (chromium mobile profile)
└── .omc/
    └── plans/ralplan-mw-camera.md          # (이 문서)
```

---

### Phase 1: Scaffold
**Goal**: Monorepo-style 레이아웃 생성, 빌드/테스트 하네스 구동 확인.

**Files created/touched**:
- `package.json` (workspaces: `.`, `server/`)
- `tsconfig.json`, `tsconfig.node.json`, `vite.config.ts`, `esbuild.bundle.mjs`, `vitest.config.ts`, `playwright.config.ts`
- `index.html` (dev host, `<div class="lybx ctg_cmn pic_face">` shell)
- `src/main.ts` (imports `camera-module.ts`, calls `CameraModule.start` with mock opts)
- `.gitignore`, `README.md`

**Dependencies**: (see Dependencies 섹션)

**Acceptance sub-criteria**:
- `npm run dev` 로 Vite dev server가 뜨고 빈 페이지에 `.pic_face` 컨테이너가 렌더된다.
- `npm run build` 가 `dist/camera-module.iife.js` 단일 파일을 산출한다 (esbuild IIFE).
- `npm test` 가 빈 vitest 스위트를 초록으로 통과한다.
- Maps to: Constraint 2 (line 46) — 독립 IIFE 번들 납품 형태.

**Public API types (formalized for AC7, Req #1)** — defined in `src/module/types.ts`:
```ts
// Error taxonomy — AC7 / AC11 callback contract
export type SessionErrorCode =
  | "permission_denied"      // AC11: getUserMedia rejected with NotAllowedError
  | "timeout"                // AC10: 15s session timeout after 3 retries
  | "upload_failed"          // AC6/AC10: POST /api/face-capture non-OK or network error
  | "webview_unsupported"    // AC11: navigator.mediaDevices undefined OR android_webview(<83) OR ios_wkwebview w/o inline config
  | "face_detection_failed"  // MediaPipe FaceLandmarker init/runtime failure
  | "internal";              // Unknown / unexpected exception

export interface SessionError {
  code: SessionErrorCode;
  message: string;            // human-readable; Korean for user-facing paths
  cause?: unknown;            // original error/exception if any
}

export type SessionResultStatus = "success" | "cancelled";

export interface SessionResult {
  status: SessionResultStatus;
  uploadedAt: number;         // Date.now() at upload resolve
  sessionMs: number;          // total session duration
  serverResponse: { ok: true; id: string }; // server returns { ok, id } per Phase 6
  score: { sharpness: number; reflectionFree: number; alignment: number; total: number };
}

export interface CameraModuleOptions {
  uploadUrl: string;
  videoEl?: HTMLVideoElement; // default: `.video_wrapper video`
  overlayEl?: HTMLCanvasElement;
  onComplete?: (result: SessionResult) => void;   // AC7: fires exactly once on success
  onError?: (err: SessionError) => void;          // AC7/AC11: typed error callback
  onStateChange?: (state: string) => void;        // diagnostic
}
```

**Contract (AC7)**: For any successful session, `onComplete` fires **exactly once** with a `SessionResult` whose `status === "success"`. For any failure path, `onError` fires **exactly once** with a `SessionError` whose `code` is one of the enum values above. `onComplete` and `onError` are mutually exclusive per session. This contract is verified by the Phase 9 test `tests/unit/camera-module.callback.spec.ts`.

---

### Performance Budget (AC8 5-second design-time constraint)

**Why here**: Iteration-1 deferred AC8 verification to Phase 10 (post-hoc measurement). That is a verification trap — if the budget cannot be proven at design time, Phase 2/3 have no shape. This section is the hard numeric contract every downstream phase must honor.

**Top-line budget**: ≤ **5000ms** from user tap on ib20 entry link to `POST /api/face-capture` request opened. AC8 (spec line 91).

**Critical fact — same-origin WASM**: MediaPipe Tasks Vision WASM binary (~1.5MB) + model `face_landmarker.task` (~3.5MB) **MUST be bundled under `public/vendor/mediapipe/`** and served by the JSP host (or Vite dev server). CDN handshake variance on LTE can add 300–1500ms jitter — unacceptable. This overrides any "CDN dynamic load" mention in iteration-1.

**Critical fact — parallelism**: Phase 2 camera warmup and Phase 3 FaceLandmarker init **MUST run in `Promise.all()`** from `CameraModule.start()`. They share no dependency; serial execution wastes ~1200ms.

**Per-slot budget (LTE iPhone 12, iOS Safari 15, cold cache — worst expected POC device)**:

| # | Slot | Budget (ms) | Parallelizable? | Notes |
|---|------|------------:|:---------------:|-------|
| S1 | JSP HTML + CSS arrival | 300 | n/a | ib20 shell already warm; only our `pic-face.css` is new. |
| S2 | `camera-module.iife.js` download+parse | 400 | — | Target <100KB min+gz. |
| S3 | WASM binary fetch (same-origin, gzip) | 500 | with S4,S5 | ~1.5MB gzipped ≈ 450ms on LTE 5Mbps. |
| S4 | `face_landmarker.task` fetch (same-origin) | 550 | with S3,S5 | ~3.5MB; largest single asset. |
| S5 | `getUserMedia` permission + first frame | 900 | with S3,S4 | iOS permission dialog dominates; can overlap WASM fetch. |
| S6 | `FaceLandmarker.createFromOptions` init | 400 | — | After S3+S4 done. |
| S7 | Align hunt (variable, user-dependent) | 800 | — | Until face crosses yaw/pitch/roll gate. |
| S8 | Align-hold fixed | 1000 | — | Hard AC3. |
| S9 | Blink prompt + detection window | 500 | — | EAR dip + recovery; usually <400ms. |
| S10 | Best-cut scoring + JPEG encode | 150 | — | 20-frame score on downscaled view + full-res `toBlob`. |
| S11 | Upload request open | 200 | — | Multipart POST, not waiting on response. |
| **Total (serial)** | | **5700** | | Over budget. |
| **Total (S3‖S4‖S5 parallel)** | | **4750** | | **Under budget (250ms headroom).** |

**Bottleneck**: S4 (model fetch) dominates. Mitigations:
1. `<link rel="preload" as="fetch" href="/resource/js/mwp/vendor/mediapipe/face_landmarker.task" crossorigin>` in JSP `<head>` — starts S4 before `camera-module.iife.js` parses.
2. HTTP cache headers (immutable + `?v=V...` cache-bust) so warm-cache visits drop S3+S4 to ~0.
3. If S4 > 800ms on real-device measurement, downgrade to MediaPipe lite model (1.6MB).

**Invariants every phase must preserve**:
- **I-1**: Phase 2 and Phase 3 start from `CameraModule.start()` via `Promise.all([videoPipeline.start(), FaceLandmarkerRunner.create(...)])`.
- **I-2**: No HTTP request to any non-same-origin host during cold load.
- **I-3**: Splash/loading UI exists **only** to hide S3‖S4‖S5 dead time, not to hide a budget overrun.
- **I-4**: Phase 10 verification measures this budget on real iPhone + real Android. If measured total ≥ 4800ms, the plan is blocked and must iterate.

**Maps to**: AC8 (spec line 91), Risk #1 (now quantitative, not perceptual).

---

### Phase 2: Camera + getUserMedia pipeline (parallel with Phase 3)
**Goal**: `VideoPipeline` 클래스로 MediaStream 생명주기를 안전하게 관리. WebView 호스트(굿뱅크 앱) 호환까지 설계에 포함. iOS Safari `visibilitychange` 재취득 규칙 내장.

**Parallelism contract (enforces Performance Budget I-1)**:
- `CameraModule.start()`는 반드시 `Promise.all([videoPipeline.start(), FaceLandmarkerRunner.create({ wasmBaseUrl, modelUrl })])` 형태로 S3‖S4‖S5 를 동시 진행한다.
- `VideoPipeline.start()`는 FaceLandmarker 로딩을 기다리지 않는다(그 역도 동일).

**Files**:
- `src/core/video-pipeline.ts`
- `src/core/webview-host.ts` (신규 — WebView 감지 유틸)
- `src/ui/unsupported-fallback.ts`

**Signatures**:
```ts
// webview-host.ts
export type HostKind = "ios_safari" | "android_chrome" | "ios_wkwebview" | "android_webview" | "other";
export function detectHost(ua?: string): HostKind;
export function isBnkGoodbankWebView(ua?: string): boolean; // UA에 "BNK" 또는 "goodbank" 토큰 탐지
export function requiresInlinePlaybackConfig(host: HostKind): boolean;

// video-pipeline.ts
export interface VideoPipelineOptions {
  videoEl: HTMLVideoElement;
  facingMode?: "user";
  idealWidth?: number;
  idealHeight?: number;
  onSuspend?: () => void;   // visibilitychange: hidden
  onResume?: () => Promise<void>; // visibilitychange: visible (재취득)
}
export class VideoPipeline {
  constructor(opts: VideoPipelineOptions);
  start(): Promise<MediaStream>;                    // getUserMedia, host-aware
  stop(): void;                                     // track.stop() for each
  isSupported(): boolean;                           // navigator.mediaDevices && host != android_webview(<chrome 83)
  hostKind(): HostKind;
  onPermissionDenied(cb: (err: DOMException) => void): void;
  // 내부적으로 document.addEventListener("visibilitychange", ...) 등록/해제 (Minor #9 수정)
}
```

**WebView compatibility (Major #4 수정)**:
- `detectHost()`는 UA 토큰 기반으로 분기:
  - iOS WKWebView: `AppleWebKit` + `Mobile` 존재 & `Safari` 누락 또는 `BNK`/`Goodbank` 앱 토큰 존재 → `ios_wkwebview`.
  - Android WebView: `; wv)` 토큰 존재 → `android_webview`.
- iOS WKWebView 가정 사항 (문서화 대상, README에 기재):
  - 호스트 앱이 `WKWebViewConfiguration.allowsInlineMediaPlayback = true`
  - `mediaTypesRequiringUserActionForPlayback = []`
  - iOS 14.3+ (WKWebView `getUserMedia` 지원 최소)
- 위 조건 불만족 시 `isSupported()` === false 로 떨어져 `#unsupported_container` fallback 이 뜬다.
- Android WebView: Chrome 83+ WebView는 `getUserMedia` 지원. 구 WebView 는 동일 fallback.

**Visibility change handling (Minor #9 수정)**:
- `document.visibilitychange` 리스너 등록.
- `hidden` 전환 시 `stop()` 호출 → MediaStreamTrack `ended` 보장 (AC12 유지) + `opts.onSuspend()` 호출.
- `visible` 재전환 시 `opts.onResume()` 를 호출하고 거기서 `start()` 재실행 → iOS Safari 권한 재프롬프트 발생 시 사용자에게 재시도 UI 를 통해 안내.
- FSM 은 `IDLE` 또는 `PREVIEW` 로 리셋.

**Acceptance sub-criteria**:
- iOS Safari 15+에서 `playsinline` 속성으로 인라인 재생됨 (AC1, line 82).
- `stop()` 호출 시 MediaStreamTrack 전부 `readyState === "ended"` (AC12, line 95).
- `isSupported() === false` 이면 `#unsupported_container` fallback UI 표시 (ANALYSIS line 121 규약).
- 권한 거부 시 `onPermissionDenied` 콜백 경유 안내 후 이전 페이지 복귀 (AC11, line 94).
- `; wv)` UA 토큰 주입 시 Android WebView 로 감지되어 Chrome 83+ 는 통과, 구버전은 fallback.
- iOS WKWebView UA 주입 시 호스트앱 설정 가정 메시지를 README 에 참조 가능한 형태로 남김.
- Tab 전환 후 복귀 시 트랙이 살아있지 않고, 의도된 재취득 경로로 복귀함.

---

### Phase 3: MediaPipe FaceLandmarker integration (parallel with Phase 2)
**Goal**: `FaceLandmarkerRunner`가 프레임마다 478 랜드마크 + 헤드 포즈 + EAR을 산출. **WASM/모델은 100% same-origin 번들**(Critical #2 수정).

**Same-origin bundling**:
- `public/vendor/mediapipe/` 하위에 아래 파일을 직접 커밋(또는 빌드 타임에 `node_modules/@mediapipe/tasks-vision/wasm/*` 을 복사하는 vite 플러그인):
  - `vision_wasm_internal.wasm`
  - `vision_wasm_internal.js`
  - `face_landmarker.task` (모델)
- `config/mediapipe.ts` 는 CDN URL 을 **절대 사용하지 않는다**.
- JSP `<head>` 에 `<link rel="preload" as="fetch" href="/resource/js/mwp/vendor/mediapipe/face_landmarker.task" crossorigin>` 추가 (Performance Budget S4 가속).

**Parallelism contract**: `FaceLandmarkerRunner.create()` 는 `Promise.all` 안에서 `VideoPipeline.start()` 와 동시에 실행되어야 한다(Invariant I-1).

**Files**:
- `src/core/face-landmarker-runner.ts`
- `src/core/metrics/ear.ts`
- `src/config/mediapipe.ts`
- `public/vendor/mediapipe/` (WASM + 모델 정적 자산)

**Signatures**:
```ts
export interface FrameMetrics {
  timestamp: number;
  landmarks: NormalizedLandmark[] | null;   // 478 points, normalized [0..1]
  headPose: { yaw: number; pitch: number; roll: number } | null;  // degrees
  ear: number | null;                        // avg(left, right), normalized
  faceBox: { x: number; y: number; w: number; h: number } | null;
}
export class FaceLandmarkerRunner {
  static async create(opts: { wasmBaseUrl: string; modelUrl: string }): Promise<FaceLandmarkerRunner>;
  detect(video: HTMLVideoElement, timestamp: number): FrameMetrics;
  close(): void;
}
```

**Acceptance sub-criteria**:
- `@mediapipe/tasks-vision` v0.10.x `FaceLandmarker.detectForVideo()` 호출, `runningMode: "VIDEO"`.
- EAR 계산은 좌/우 눈 6점 표준 공식: `(|p2-p6| + |p3-p5|) / (2*|p1-p4|)` (AC4 근거, line 85).
- 30fps 타겟 디바이스에서 frame skip 없이 동작해야 링버퍼 20프레임 ≈ 600~800ms 가정(spec line 49) 성립.
- Maps to: Constraint 4 (line 48), AC4 (line 85).

---

### Phase 4: Action state machine (front-align → blink)
**Goal**: 2단계 고정 FSM. 입력은 `FrameMetrics` 스트림, 출력은 상태 전이 이벤트.

**Files**:
- `src/core/action-state-machine.ts`
- `src/core/metrics/alignment.ts`
- `src/config/thresholds.ts`

**States**: `IDLE → PERMISSION → PREVIEW → ALIGNING → ALIGN_HOLD(1s) → BLINK_PROMPT → BLINK_DETECTING → BLINK_CONFIRMED → CAPTURED → UPLOADING → DONE` (+ `TIMEOUT`, `RETRY`, `FAILED`, `MANUAL_FALLBACK`)

**Invalidation back-edges (Major #3 수정)**:
- **From `ALIGN_HOLD`**: if alignment breaks (yaw|pitch|roll 임계 초과) OR `landmarks === null` → `ALIGNING` (align-hold 타이머 리셋).
- **From `BLINK_PROMPT`**: if alignment breaks OR face lost ≥2 frames → `ALIGNING` (blink 대기 취소, EAR 버퍼 `clear()`).
- **From `BLINK_DETECTING`**: if alignment breaks OR face lost ≥2 consecutive frames → `ALIGNING` + `clearEarBuffer()`. 이 규칙이 핵심 — head-tilt-induced 눈꺼풀 가림으로 인한 false blink 를 차단.
- **From any active state**: if `MANUAL_FALLBACK` 이벤트(사용자가 fallback 트리거) → `MANUAL_FALLBACK` 상태로 즉시 전이 (Phase 8 참조).

**Signatures**:
```ts
export type ActionState =
  | "idle" | "permission" | "preview" | "aligning" | "align_hold"
  | "blink_prompt" | "blink_detecting" | "blink_confirmed"
  | "captured" | "uploading" | "done" | "timeout" | "retry" | "failed";

export interface ActionEvent {
  from: ActionState;
  to: ActionState;
  at: number;
  reason?: string;
}

export class ActionStateMachine {
  constructor(cfg: {
    alignHoldMs: number;          // default 1000 (AC3)
    sessionTimeoutMs: number;     // default 15000 (AC10)
    maxRetries: number;           // default 3 (AC10)
    maxBlinkRetriesBeforeFallback: number; // default 2 → triggers MANUAL_FALLBACK
    faceLostFrameThreshold: number; // default 2 — consecutive null landmark frames that invalidate BLINK_DETECTING
    yawMaxDeg: number; pitchMaxDeg: number; rollMaxDeg: number;
    earBlinkClosedMax: number; earBlinkOpenMin: number;
  });
  feed(metrics: FrameMetrics): void;
  onTransition(cb: (e: ActionEvent) => void): void;
  onBlinkConfirmed(cb: (blinkFrameTs: number) => void): void;
  onTimeout(cb: () => void): void;
  onFallbackRequested(cb: () => void): void; // transitions to MANUAL_FALLBACK
  triggerManualFallback(): void;              // from UI (Phase 8)
  reset(): void;
  clearEarBuffer(): void;                     // called on invalidation back-edges
  getState(): ActionState;
}
```

**Blink detection**: EAR이 연속 M프레임 동안 `earBlinkClosedMax` 이하로 떨어졌다가 다시 `earBlinkOpenMin` 이상으로 회복하는 하강-상승 패턴을 요구. 노이즈 방지용 3-프레임 rolling average. **중요**: `BLINK_DETECTING` 중 alignment 가 깨지거나 `faceLostFrameThreshold` 이상 연속 `landmarks === null` 발생 시 즉시 `ALIGNING` 으로 복귀하며 EAR 버퍼를 비운다.

**Acceptance sub-criteria**:
- 정면 정렬(yaw/pitch/roll 임계 이내) + 1초 안정 → BLINK_PROMPT 진입 (AC3, line 84).
- EAR 하강-상승 패턴에서 `onBlinkConfirmed(ts)` 발화 (AC4, line 85).
- 15초 타임아웃 시 `onTimeout` + 재시도 UI, 3회 초과 시 실패 (AC10, line 93).
- **Invalidation 유닛 테스트**: "head tilt during blink" 픽스처 → BLINK_DETECTING 에서 ALIGNING 으로 복귀, blink 미확정. "face disappears mid-action" 픽스처 → 동일 복귀.
- Unit test: 합성 landmark 스트림 JSON 픽스처로 상태 전이 시퀀스 검증.
- `triggerManualFallback()` 호출 시 즉시 `MANUAL_FALLBACK` 상태 진입 (Phase 8 접근성 경로).

---

### Phase 5: Ring buffer + best-cut scorer (REWRITTEN for iter2)
**Goal**: 최근 N=20 프레임의 **full-resolution `ImageBitmap`을 직접 소유**하고, 스코어 계산은 동일 비트맵에서 파생된 **cheap downscaled view**로 수행한다. `pickBest()` 가 반환한 비트맵은 그대로 업로드 인코더로 전달된다. 즉 **scored frame ≡ uploaded frame**. (Critical #1 수정)

**Why the rewrite**: iteration-1 은 "축소본만 저장하고 업로드 시점에 `video.currentTime` 으로 원본 해상도를 다시 샘플링" 이라고 기술했는데, 이는 라이브 MediaStream 에서 물리적으로 불가능하다 (`<video>` 는 live stream 을 역방향 seek 할 수 없다). 그 결과 스코어를 계산한 프레임과 업로드되는 프레임이 서로 다른 프레임이 되어 AC5/AC9 를 위반한다. Iteration-2 는 소유권을 뒤집어 **링버퍼가 full-res bitmap 의 단일 소유자**가 된다.

**Memory budget (explicit)**:
- 20 frames × 640×360 RGBA (8-bit) ≈ 20 × 921,600 bytes ≈ **18 MB**.
- 해상도 조정: `idealWidth=640 / idealHeight=360` (facingMode: user). 모바일 후면카메라 요구가 없으므로 전면 640×360 충분.
- iOS Safari 15 의 `ImageBitmap` backing store 는 GPU 텍스처로 오프로드되므로 JS heap 압박은 제한적이다. 그래도 18MB 는 `thresholds.ts` 에 상수로 못박고 `RingBuffer.capacity * estimatedFrameBytes` 를 생성자에서 assert.
- 축출 시 `close()` 가 호출되지 않으면 GPU 메모리 누적 위험 → 유닛 테스트 필수.

**Files**:
- `src/core/ring-buffer.ts`
- `src/core/best-cut-scorer.ts`
- `src/core/metrics/laplacian.ts`
- `src/core/metrics/reflection.ts`
- `src/core/frame-view.ts` (신규 — downscaled view cache)

**Signatures**:
```ts
// ring-buffer.ts
export interface RingFrame {
  timestamp: number;               // performance.now() at capture
  fullBitmap: ImageBitmap;         // FULL-resolution snapshot owned by this slot (~640x360)
  metrics: FrameMetrics;           // landmarks/pose/ear computed at capture time
  // NOTE: no thumbBitmap, no videoTimestamp. Scoring derives a cheap view on demand.
  close(): void;                   // calls fullBitmap.close(); idempotent
}

export class RingBuffer {
  constructor(capacity: number);
  push(frame: RingFrame): void;    // FIFO; evicted frame.close() is called
  getWindow(centerTs: number, halfSpan: number): RingFrame[];
  snapshot(): RingFrame[];         // shallow copy for scoring pass
  detach(frame: RingFrame): void;  // removes from buffer without closing (ownership transfer to encoder)
  clear(): void;                   // close() all remaining bitmaps (Constraint 10)
  estimatedBytes(): number;        // capacity * 640 * 360 * 4
}

// frame-view.ts — cheap downscaled view cached per scoring pass
export interface FrameView {
  width: number;                   // e.g. 160
  height: number;                  // e.g. 90
  gray: Uint8ClampedArray;         // luminance
  rgba: Uint8ClampedArray;         // for reflection histogram
}
export function deriveFrameView(bitmap: ImageBitmap, targetW: number, targetH: number): FrameView;
// Implementation: OffscreenCanvas (or HTMLCanvasElement fallback) drawImage with scaling,
// getImageData once, compute grayscale inline. NOT cached on the RingFrame — pure function
// called at score-time only, throwaway buffers GC'd immediately after the pass.

// best-cut-scorer.ts
export interface ScoreWeights { w1: number; w2: number; w3: number; } // 0.4:0.3:0.3 default
export interface ScoredFrame {
  frame: RingFrame;                // reference to the OWNED full-res bitmap
  sharpness: number;
  reflectionFree: number;
  alignment: number;
  total: number;
}
export class BestCutScorer {
  constructor(weights: ScoreWeights, viewWidth?: number, viewHeight?: number);
  score(frames: RingFrame[]): ScoredFrame[];  // internally calls deriveFrameView per frame
  pickBest(frames: RingFrame[]): ScoredFrame | null;
}
```

**Capture flow (Phase 3/5 handshake)**:
1. FaceLandmarkerRunner emits `FrameMetrics` for current video frame.
2. CameraModule calls `createImageBitmap(videoEl)` — this produces a **full-resolution snapshot** at the current video frame, owned by the caller.
3. Wrap as `RingFrame { timestamp, fullBitmap, metrics, close }` and `ringBuffer.push()`.
4. FIFO eviction `close()`s any displaced frame's bitmap.
5. On `BLINK_CONFIRMED(ts)`, snapshot the buffer window, call `scorer.pickBest(window)`, then `ringBuffer.detach(best.frame)` to transfer ownership to the encoder. All other frames are `clear()`-ed. Encoder consumes `best.frame.fullBitmap`, then calls `best.frame.close()` itself after `toBlob` resolves.

**Metric formulas (run on `FrameView`, not on raw ImageBitmap)**:
- `laplacian.ts`: 160×90 grayscale view 에서 3×3 Laplacian 커널 `[[0,1,0],[1,-4,1],[0,1,0]]` convolution → 분산.
- `reflection.ts`: 얼굴 bbox 를 뷰 좌표계로 스케일한 영역의 휘도 히스토그램(`view.rgba` → Y=0.299R+0.587G+0.114B), 250~255 bin 비율. 값이 클수록 `reflectionFree` 점수 낮음.
- `alignment.ts`: yaw/pitch/roll 정규화 후 `1 - mean`. faceBox 중심과 가이드 중심 거리 0.5 가중.

**Normalization**: 각 축 0..1 min-max 후 `total = w1*sharp + w2*refl + w3*align`.

**Invariants**:
- **I-5**: `ScoredFrame.frame.fullBitmap` 은 업로드 인코더가 소비하는 정확히 그 bitmap 이다. 다른 비트맵/프레임을 encode 하지 않는다.
- **I-6**: `deriveFrameView` 는 `RingFrame` 에 영속 캐싱하지 않는다 (RingFrame 슬롯당 메모리 증가 방지).
- **I-7**: `RingBuffer.push` 가 호출한 모든 evict 는 반드시 `close()` 와 1:1 대응.

**Acceptance sub-criteria**:
- `pickBest` 가 빛반사 프레임을 선택하지 않음 — 합성 프레임 unit test (AC9 property).
- `pickBest()` 가 반환한 bitmap 이 실제 업로드되는 bitmap 과 동일 객체 참조임을 integration test 로 검증 (Phase 9 integration fixture, Major #5 수정).
- 20프레임 용량, eviction 시 `ImageBitmap.close()` spy 호출 확인.
- `clear()` 이후 Heap ImageBitmap 참조 0 (AC13).
- `estimatedBytes()` 가 20MB 이하를 assert (design-time 가드).
- Maps to: AC5 (line 86), AC9 (line 92), Constraint 10 (line 54).

---

### Phase 6: Upload + mock server (REWRITTEN for iter2)
**Goal**: Phase 5 가 소유권 이전한 `RingFrame` 의 full-res `ImageBitmap` 을 JPEG 으로 인코딩 → multipart POST → 서버 저장. **절대 video element 를 다시 샘플링하지 않는다** (Critical #1 수정).

**Files**:
- `src/core/jpeg-encoder.ts`
- `src/core/uploader.ts`
- `server/src/index.ts`
- `server/src/routes/face-capture.ts`
- `server/src/storage.ts`

**Signatures**:
```ts
// jpeg-encoder.ts
import type { RingFrame } from "./ring-buffer";

/**
 * Encodes the OWNED full-resolution ImageBitmap of the best scored frame.
 * Does NOT touch the live <video> element.
 * Always calls bestFrame.close() via try/finally, even on encode failure (AC13, Rec D).
 */
export async function encodeJpeg(
  bestFrame: RingFrame,
  quality?: number   // default 0.92
): Promise<Blob>;
```

**Implementation — explicit branch logic (Req #2)**:
```
1. width  = bestFrame.fullBitmap.width
2. height = bestFrame.fullBitmap.height
3. hasOffscreenConvert =
     typeof OffscreenCanvas !== "undefined"
     && typeof OffscreenCanvas.prototype.convertToBlob === "function"
4. try {
     if (hasOffscreenConvert) {
       // Path A — iOS Safari 16.4+, Android Chrome
       canvas = new OffscreenCanvas(width, height)
       ctx    = canvas.getContext("2d", { willReadFrequently: false })
       ctx.drawImage(bestFrame.fullBitmap, 0, 0)
       blob   = await canvas.convertToBlob({ type: "image/jpeg", quality: quality ?? 0.92 })
     } else {
       // Path B — iOS Safari 15.0 / 16.0 / 16.3 (no OffscreenCanvas.convertToBlob)
       canvas = document.createElement("canvas")
       canvas.width  = width
       canvas.height = height
       ctx    = canvas.getContext("2d")
       ctx.drawImage(bestFrame.fullBitmap, 0, 0)
       blob   = await new Promise<Blob>((resolve, reject) =>
                  canvas.toBlob(
                    b => b ? resolve(b) : reject(new Error("toBlob returned null")),
                    "image/jpeg",
                    quality ?? 0.92
                  ))
     }
     return blob
   } finally {
     // AC13: always release the owned bitmap, even if draw/encode throws
     bestFrame.close()
   }
```

**Feature-detect rationale**: `OffscreenCanvas.prototype.convertToBlob` shipped in Safari 16.4 (March 2023). iOS 15.0 – 16.3 users (meaningful portion of the POC target window) WILL hit `undefined` at runtime. Path B is not a nice-to-have — it is load-bearing for ~30% of the iOS 15+ target window. Both paths MUST work on: iOS Safari 15.0, 16.0, 16.3, 16.4+, Android Chrome (latest 2 majors).

// uploader.ts
export interface UploadMeta {
  capturedAt: number;
  sessionMs: number;
  actions: ActionEvent[];
  score: { sharpness: number; reflectionFree: number; alignment: number; total: number };
}
export class Uploader {
  constructor(endpoint: string);
  upload(jpeg: Blob, meta: UploadMeta): Promise<{ ok: boolean; id?: string; error?: string }>;
  // After resolve(): internal Blob reference is nulled (AC13).
}
```

**Invariant**: The Blob produced by `encodeJpeg` is **byte-for-byte derived** from `bestFrame.fullBitmap`. There is no path in the codebase where an upload comes from any other source.

**Server** (`POST /api/face-capture`):
- `multer` memory storage, field `image` (Blob) + field `meta` (JSON string).
- `server/uploads/<uuid>.jpg` 저장, `<uuid>.json`로 meta 저장. 응답 `{ ok: true, id }`.
- CORS 허용(dev: `http://localhost:5173`).

**Acceptance sub-criteria**:
- 원본 비디오 해상도 JPEG 1장이 업로드되고 서버 디스크에 저장됨 (AC6, AC14; lines 87, 99).
- 업로드 후 `Uploader` 내부 참조 null 처리, 호출자는 Blob 참조 해제 (AC13, line 96).
- 업로드 실패 시 재시도 UI 경로 진입 (AC10, line 93).
- **`OffscreenCanvas.prototype.convertToBlob` feature-detect fallback (Req #2)**: `encodeJpeg` MUST feature-detect `OffscreenCanvas.prototype.convertToBlob`. If absent, it MUST fall back to `HTMLCanvasElement.toBlob` via `document.createElement("canvas") → getContext("2d") → drawImage → toBlob`. Both paths MUST produce a valid `image/jpeg` Blob at the original bitmap dimensions on **iOS Safari 15.0, 16.0, 16.3, and 16.4+**. Verified by `tests/unit/jpeg-encoder.spec.ts` which stubs both branches via `Object.defineProperty` on mock `OffscreenCanvas`.
- **Try/finally guarantees `bestFrame.close()` (Rec D, AC13)**: Even if `drawImage` / `convertToBlob` / `toBlob` throws or rejects, `bestFrame.close()` MUST run exactly once. Verified by `tests/unit/jpeg-encoder.spec.ts` with an inject-error fixture.
- **AC7 callback contract**: When called from `CameraModule`'s happy path, the resulting Blob flows to `Uploader.upload()`; on success, `onComplete(SessionResult)` fires exactly once with the shape defined in `types.ts`. On upload failure, `onError({ code: "upload_failed", ... })` fires exactly once. Verified by `tests/unit/camera-module.callback.spec.ts` (Req #1).

---

### Phase 7: JSP shell page + structural parity with existing page
**Goal**: ib20 라우트 JSP 템플릿 작성. **Class/z-index/header/exit-button/brand-color parity** 를 재현한다. **"Pixel parity" 는 달성 목표가 아니다** — 얼굴 촬영은 본질적으로 타원 가이드가 옳고, 주민증 촬영용 4-PNG 사각 브라켓과는 기하가 다르다 (Major #6 수정).

**Files**:
- `jsp-shell/MWPTBIM60000000.jsp`
- `jsp-shell/mock-header.html`
- `src/styles/pic-face.css`
- `src/styles/camera-layout.css`
- `public/resource/img/mwp/ico_face_01.png` ~ `ico_face_04.png` (가이드 브라켓 플레이스홀더)

**JSP skeleton** (ANALYSIS lines 22–46 의 class/z-index/header 구조 미러, button ID 신규):
```html
<div class="lybx ctg_cmn pic_face" style="position:absolute; top:0; overflow-y:hidden">
  <div class="scrollBox">
    <div class="video_wrapper">
      <video autoplay playsinline></video>
    </div>
    <div class="overlay">
      <canvas id="overlay_canvas" width="360" height="649"></canvas>
      <!-- 2026-04-11 장차법 준수 / 얼굴 촬영 신규, button aria-label "얼굴촬영" -->
      <div id="help_overlay"><span id="help_text" class="guide_text" aria-live="polite"><b>얼굴을 원형 가이드에 맞춰주세요</b></span></div>
      <div id="button_overlay" class="button_overlay">
        <!-- iter2: new ID; class parity preserved via .btn_camera -->
        <button type="button" class="btn_camera" aria-label="얼굴촬영" id="face_auto_capture" autocomplete="off" autocorrect="off"></button>
      </div>
    </div>
    <button type="button" class="btn_exit outside_btn" id="btnClose" autocomplete="off" autocorrect="off">나가기</button>
  </div>
</div>
<link rel="preload" as="fetch" href="/resource/js/mwp/vendor/mediapipe/face_landmarker.task" crossorigin>
<script src="/resource/js/mwp/camera-module.iife.js?v=V20260411000001"></script>
<script>CameraModule.start({ uploadUrl: "/api/face-capture" });</script>
```

**CSS** (`pic-face.css`): ANALYSIS lines 152–189 의 `.pic_idcard` 규칙을 얼굴용으로 복제하되, 가이드 기하는 **의도적으로 다르다**.
- `.pic_face::before` 어두운 오버레이 (opacity 0.6) — 동일.
- `.pic_face .pic_wrap .txt` color `rgb(255, 242, 95)` — 브랜드 옐로우 동일.
- 가이드: **Canvas 로 얼굴 타원 1개를 그린다** (brand yellow stroke). 4-PNG 사각 브라켓 에셋은 사용하지 않는다. 이것은 누락이 아니라 얼굴 촬영 기하 요구의 결과다.

**Parity contract (what "parity" means in this plan)**:
- **Class parity**: `.lybx`, `.ctg_cmn`, `.pic_face` (vs. `.pic_idcard`), `.scrollBox`, `.video_wrapper`, `.overlay`, `.btn_camera`, `.btn_exit`, `.outside_btn` 모두 기존과 동일 네이밍 규약.
- **Z-index parity**: 비디오 0 / overlay 10 / help 90 / button 100 — ANALYSIS lines 80–92 그대로.
- **Header parity**: 공용 `bnk-new-2023` 헤더 모사(`mock-header.html`) 를 동일 위치/높이에 삽입.
- **Exit button parity**: `#btnClose` 동일 ID, 동일 위치, 동일 라벨 "나가기".
- **Brand color parity**: `rgb(255, 242, 95)` 옐로우, dark overlay opacity 0.6.
- **Geometry NON-parity (intentional)**: 가이드 = 타원. 주민증 페이지 = 사각 브라켓. 이것은 보존 대상이 아니다.

**Decision note (`#auto_snap` → `#face_auto_capture`, Major #8 수정)**:
ANALYSIS line 255 는 `#auto_snap` 이 기존 공용 CSS/JS 셀렉터와 어떤 관계인지 **미해결 불확실성**이라고 명시했다. Iteration-1 은 "의미 부여 재사용" 으로 이 불확실성을 우회했으나 이는 근거 없는 추정이었다. Iteration-2 는 **새 ID `#face_auto_capture`** 를 도입하여 잠재적 셀렉터 충돌 위험을 원천 차단한다. 시각적·DOM 대칭은 **`class="btn_camera"`** 로 보존된다 (ID 가 아니라 class 가 스타일을 담당하는 것이 기존 컨벤션과 일치). 운영 이식 단계에서 만약 실 기존 코드에 `#auto_snap` 전용 JS 핸들러가 있다면 그때 재평가한다 — 단, POC 에서는 깨끗한 새 이름이 옳다.

**Acceptance sub-criteria**:
- Chrome DevTools mobile emulation(iPhone 14 Pro, Galaxy S22)에서 BNK 헤더 + 나가기 버튼 위치가 기존 페이지와 일치 (class/z-index/header parity, AC2).
- z-index 레이어(비디오 0 / overlay 10 / help 90 / button 100) 확인 (ANALYSIS lines 80–92).
- 장차법 주석 + `aria-label="얼굴촬영"` 존재 (AC2, ANALYSIS line 60).
- 얼굴 가이드는 타원이며, 이는 의도된 설계 결정 (NOT a pixel-parity regression).
- DOM 검사에서 `#face_auto_capture` 존재, `#auto_snap` 부재 — 신규 ID 확정.

---

### Phase 8: Accessibility + manual capture fallback + unsupported browser
**Goal**: 장차법 준수, 키보드 접근성, 미지원 브라우저 UX, **그리고 깜빡임 불가 사용자를 위한 수동 캡처 경로** (Major #7 수정).

**Files**:
- `src/ui/a11y.ts`
- `src/ui/unsupported-fallback.ts`
- `src/ui/manual-capture-fallback.ts` (신규)
- `src/ui/help-text-controller.ts`
- `src/ui/retry-ui.ts`

**요구사항**:
- `#help_text` 를 `aria-live="polite"` live region 으로 선언, 상태 전이마다 문구 업데이트 (align → blink → captured).
- `#btnClose`, `#face_auto_capture` 키보드 focus 순서 보장.
- `navigator.mediaDevices === undefined` 또는 `getUserMedia` 예외 시 `#unsupported_container` 표시 (ANALYSIS lines 74–77, 121 규약).
- 장차법 변경 이력 주석 컨벤션 준수 (ANALYSIS lines 60–64).

**Manual capture fallback mode (장차법 핵심 준수 메커니즘)**:
- **진입 조건**:
  1. Blink 재시도 횟수 ≥ `maxBlinkRetriesBeforeFallback` (default 2, AC10 retry exhaustion 경로의 한 갈래), OR
  2. 초기 감지: `window.matchMedia('(prefers-reduced-motion: reduce)').matches`, OR
  3. 사용자가 fallback 링크/버튼을 명시적으로 탭.
- **동작**: FSM 이 `MANUAL_FALLBACK` 상태로 전이 → `FaceLandmarker.detectForVideo` 피드가 중단되지는 않지만, blink 요구가 해제되고 `#face_auto_capture` 버튼이 **tap-to-capture** 로 재활성화된다. 사용자가 탭하는 순간 현재 full-res `ImageBitmap` 을 `createImageBitmap(videoEl)` 으로 생성해 **Phase 5/6 경로로 그대로 전달** (scorer 는 단일 프레임에 대해 동작하고, alignment/reflection 점수는 로깅 용도로만 포함).
- **UI**: `#help_text` 문구가 "화면을 직접 탭해서 촬영할 수 있습니다" 로 갱신. 버튼에 `aria-pressed="false"` 초기 상태. 나가기 버튼은 그대로.
- **접근성 경로 명시**: 이 모드는 장차법 준수의 **기본 대체 경로**다. 음성/스크린리더 사용자는 탭 한 번으로 캡처를 완수할 수 있다.
- **FSM hook**: Phase 4 의 `triggerManualFallback()` 이 이 UI 의 진입점이며, `manual-capture-fallback.ts` 는 상태 머신과 그 버튼을 바인딩한다.

**Acceptance sub-criteria**:
- 스크린리더(VoiceOver/TalkBack 수동)에서 상태 전이가 읽힘.
- getUserMedia 미지원 환경에서 명확한 폴백 UI 진입 (AC11, line 94).
- Blink 2회 실패 후 자동으로 manual capture 모드로 전환되며, 탭 캡처가 동일한 업로드 경로로 진입한다.
- `prefers-reduced-motion: reduce` 환경에서 세션 시작부터 manual 모드로 진입.
- 장차법 대체 경로 문서가 README 에 기록됨.

---

### Phase 9: Tests (Vitest unit + integration + Playwright browser)
**Goal**: 자동화 가능한 범위는 전부 커버. 특히 **"업로드되는 실제 산출물이 반사 프레임으로부터 유래하지 않음"** 을 integration 레벨에서 증명한다 (Major #5 수정).

**Files**:
- `tests/unit/*.spec.ts` (15개 — iter2에서 3개 신규, iter3에서 추가 5개 신규)
- `tests/integration/session-happy-path.spec.ts`
- `tests/integration/reflection-rejection.spec.ts` (신규, Major #5)
- `tests/integration/webview-ua-fallback.spec.ts` (신규, Major #4)
- `tests/fixtures/synthetic-frames/{sharp,blurry,reflection,reflection-burst}.png`
- `tests/fixtures/landmark-streams/{aligned,blinking,head-tilt-during-blink,face-lost-mid-action}.json`
- `tests/fixtures/ua-strings/{ios-wkwebview,android-webview-modern,android-webview-legacy,goodbank-ios,goodbank-android}.txt`
- `tests/fixtures/jsp-shell/MWPTBIM60000000.static.html` (iter3, Rec B — rendered JSP skeleton for DOM snapshot)
- `tests/browser/happy-path.spec.ts`

**Unit** (Vitest, jsdom/node):
- `ring-buffer.spec.ts`: capacity 초과 eviction, `fullBitmap.close()` spy 호출 확인, `detach()` 소유권 이전 의미, `estimatedBytes()` 가드.
- `laplacian.spec.ts`: `sharp.png` 의 분산 > `blurry.png` 의 분산.
- `reflection.spec.ts`: `reflection.png` 에서 `reflectionFree` 점수가 최저.
- `alignment.spec.ts`: yaw=0/pitch=0/roll=0 → 1.0, yaw=30° → 정상 감쇠.
- `ear.spec.ts`: 감은 눈/뜬 눈 랜드마크 → 공식 결과 차이.
- `best-cut-scorer.spec.ts`: 3개 합성 프레임 중 "선명+반사없음+정렬" 프레임이 우승, 반환된 `ScoredFrame.frame.fullBitmap` 이 입력 중 하나와 identity equal (AC5, AC9).
- `frame-view.spec.ts` (신규): `deriveFrameView` 가 `RingFrame` 에 캐싱되지 않음, 반복 호출 시마다 새 버퍼.
- `action-state-machine.spec.ts`: `aligned.json` 스트림 → ALIGN_HOLD 1초 후 BLINK_PROMPT, `blinking.json` → BLINK_CONFIRMED, 15초 idle → TIMEOUT.
- `action-state-machine-invalidation.spec.ts` (신규, Major #3): `head-tilt-during-blink.json` → BLINK_DETECTING 진입 후 yaw 임계 초과 시점에 ALIGNING 으로 복귀, EAR 버퍼 비워짐. `face-lost-mid-action.json` → 2연속 `landmarks===null` 시 동일 복귀.
- `webview-host.spec.ts` (신규, Major #4): UA 픽스처 문자열 → `detectHost` 결과 검증, `isBnkGoodbankWebView` 검증.
- **`camera-module.callback.spec.ts` (신규 iter3, Req #1)**: Instantiates `CameraModule` with spy `onComplete` / `onError`. **Happy path**: stub `VideoPipeline`, `FaceLandmarkerRunner`, `ActionStateMachine`, `BestCutScorer`, and `Uploader` so the session runs through `IDLE → ... → CAPTURED → UPLOADING → DONE`. Assert `onComplete` called **exactly once**, with argument matching `SessionResult` shape (`status: "success"`, `uploadedAt: number`, `sessionMs: number`, `serverResponse: { ok: true, id: string }`, `score` object with the 4 numeric fields), and that `onError` was **never** called. **Error paths** (one case per code): stub `VideoPipeline.start()` to reject with `NotAllowedError` → assert `onError({ code: "permission_denied" })` fires once and `onComplete` is never called. Stub `ActionStateMachine.onTimeout` trigger → `onError({ code: "timeout" })`. Stub `Uploader.upload` to resolve `{ ok: false, error }` → `onError({ code: "upload_failed" })`. Stub `VideoPipeline.isSupported() === false` → `onError({ code: "webview_unsupported" })`. Each case also asserts mutual exclusion (exactly one of the two callbacks).
- **`jpeg-encoder.spec.ts` (신규 iter3, Req #2 + Rec D)**: Two describe blocks. **Path A (OffscreenCanvas.convertToBlob present)**: mock `globalThis.OffscreenCanvas` with a stub whose `convertToBlob` returns a pre-built `Blob(["\xFF\xD8\xFF...dummy"], { type: "image/jpeg" })`; call `encodeJpeg(fakeRingFrame)`; assert returned Blob `type === "image/jpeg"`, size > 0, and `fakeRingFrame.close()` spy was called exactly once. **Path B (convertToBlob undefined)**: use `Object.defineProperty` to delete `convertToBlob` from the mock `OffscreenCanvas.prototype`; mock `document.createElement("canvas")` so `.toBlob(cb, ...)` invokes `cb(new Blob(...))`; call `encodeJpeg`; assert same output contract. **Error path (Rec D)**: stub `ctx.drawImage` to throw; call `encodeJpeg`; expect rejection AND `fakeRingFrame.close()` spy still called exactly once (try/finally verification). Also assert iOS 15 behavior by setting `navigator.userAgent` to an iOS 15 Safari UA stub.
- **`jsp-shell-parity.spec.ts` (신규 iter3, Rec B — AC2)**: Loads `tests/fixtures/jsp-shell/MWPTBIM60000000.static.html` (rendered JSP skeleton without server-side includes) into jsdom; asserts presence of selectors: `.lybx.ctg_cmn.pic_face`, `.scrollBox`, `.video_wrapper > video[playsinline]`, `.overlay > #overlay_canvas`, `#help_overlay > #help_text[aria-live="polite"]`, `#button_overlay > button.btn_camera#face_auto_capture[aria-label="얼굴촬영"]`, `.btn_exit.outside_btn#btnClose`. Also computes effective z-index on each layer and asserts video 0 / overlay 10 / help 90 / button 100 (ANALYSIS lines 80–92).
- **`video-pipeline.permission.spec.ts` (신규 iter3, Rec C — AC11)**: Mocks `navigator.mediaDevices.getUserMedia` to reject with a `DOMException("denied", "NotAllowedError")`. Instantiates `VideoPipeline`, registers `onPermissionDenied` spy, calls `start()`. Asserts `onPermissionDenied` is invoked with the DOMException and that `start()` rejects in a way that `CameraModule` can map to `SessionError { code: "permission_denied" }`.
- **`video-pipeline.track-stop.spec.ts` (신규 iter3, Rec C — AC12)**: Mocks `getUserMedia` to resolve a fake `MediaStream` whose tracks are `MediaStreamTrack` stubs with `readyState` transitioning to `"ended"` on `.stop()`. After `VideoPipeline.stop()`, asserts every track's `readyState === "ended"` and `stop()` spy was called per track.

**Integration** (Vitest + jsdom + canvas mock):
- `session-happy-path.spec.ts`: 모의 MediaStream + FaceLandmarkerRunner mock → 전체 세션 → `Uploader.upload` 호출 인자 shape 검증.
- `reflection-rejection.spec.ts` (신규, Major #5): 모의 MediaStream 이 20 프레임을 흘리는데 그 중 프레임 N (예: 12번째) 에 **의도적 reflection burst** 를 주입한다 (full-res 합성 이미지). 세션이 정상적으로 BLINK_CONFIRMED 로 끝나면 `Uploader.upload` 에 전달된 Blob 을 decode → pixel hash 를 reflection-burst 프레임의 pixel hash 와 비교 → **불일치** 를 assert. 즉 "점수 계산과 업로드가 같은 프레임 객체를 공유" 라는 iter2 Phase 5 Invariant I-5 를 black-box 로 검증한다.
- `webview-ua-fallback.spec.ts` (신규, Major #4): `navigator.userAgent` 를 `ios-wkwebview`/`android-webview-legacy` 로 스텁 → `VideoPipeline.isSupported()` 가 각 케이스별로 올바른 분기, 미지원 시 `#unsupported_container` 진입 이벤트 발화 검증.

**Browser** (Playwright, chromium `devices['iPhone 13']`): `fake-ui-for-media-stream` + `use-fake-device-for-media-stream` 플래그로 가상 카메라 주입, Vite dev 서버 상대로 happy path, 업로드 요청이 `POST /api/face-capture`로 나가는지 assert.

**Acceptance sub-criteria**:
- Vitest 전 테스트 초록, 커버리지 80%+ (core 모듈 기준).
- `reflection-rejection.spec.ts` 가 업로드된 Blob 의 출처를 검증하여 AC9 를 **end-to-end** 로 증명.
- `webview-ua-fallback.spec.ts` 가 3개 이상 UA 케이스 (iOS Safari / iOS WKWebView / Android WebView legacy) 를 통과.
- FSM invalidation 테스트가 head-tilt 와 face-lost 두 시나리오 모두 통과.
- **`camera-module.callback.spec.ts` (Req #1)**: AC7 증명. Happy path에서 `onComplete` 정확히 1회, 에러 경로 4종(`permission_denied`/`timeout`/`upload_failed`/`webview_unsupported`)에서 각각 `onError` 정확히 1회, 상호 배타 보장.
- **`jpeg-encoder.spec.ts` (Req #2 + Rec D)**: Path A (convertToBlob 있음) / Path B (convertToBlob 없음 — iOS 15~16.3 시뮬레이션) 둘 다 유효 JPEG Blob 생성, 예외 경로에서도 `bestFrame.close()` 1회 호출 (try/finally 검증).
- **`jsp-shell-parity.spec.ts` (Rec B)**: AC2 DOM 스냅샷 — 모든 class/ID/z-index가 기대치와 일치.
- **`video-pipeline.permission.spec.ts` (Rec C)**: AC11 권한 거부 콜백 경로.
- **`video-pipeline.track-stop.spec.ts` (Rec C)**: AC12 `readyState === "ended"` 검증.
- Playwright happy path 통과 (AC15 보조 근거, line 100).

---

### Phase 10: Polish & verification
**Goal**: AC1~AC15 전 항목 수작업 검증 + 계측 + 문서화.

**Tasks**:
- iPhone(실제 iOS Safari 15+) / Android(실제 Chrome 최신) 수동 리그레션 시나리오 실행 (AC1, AC15).
- DevTools Performance로 세션 평균 5초 이내 측정 (AC8, line 91).
- DevTools Memory 스냅샷: 세션 종료 후 ImageBitmap 참조 0 확인 (AC13, line 96).
- `MediaStreamTrack.readyState` 확인 스크립트 (AC12, line 95).
- README에 빌드/실행/수동 테스트 절차 기록, 설정 가중치 `thresholds.ts` 주석.
- 번들 산출물 크기 보고(MediaPipe 모델 제외 JS < 100KB 목표).
- 남은 불확실성 5개(ANALYSIS lines 255–260)는 운영 이식 시 해소될 TODO로 README에 명시.
- **Warm-cache assertion (Req #3)**: On second visit to the JSP route with browser cache primed, execute a DevTools snippet that calls `performance.getEntriesByType('resource').filter(e => e.name.includes('/vendor/mediapipe/'))` and asserts every entry has `transferSize === 0` (served from disk cache via `immutable` header). Record the before/after numbers in the Phase 10 report.
- **Cold-cache S4 measurement + lite-model trigger (Req #3)**: Measure `face_landmarker.task` fetch duration on the first production-device session (LTE, cold cache). If measured S4 > **800ms**, swap `face_landmarker.task` for the lite variant (`face_landmarker_lite.task`), redeploy `public/vendor/mediapipe/`, and re-measure. Document both measurements and the threshold decision in the Phase 10 report.
- **Ring-buffer memory downgrade trigger (Rec E)**: On iPhone SE (smallest expected device), take a DevTools Memory snapshot at peak session load (frame 20 in ring buffer, just before BLINK_CONFIRMED). If peak JS heap exceeds **60 MB**, downgrade `RingBuffer.capacity` from 20 to 12 (update `thresholds.ts` constant) and re-measure. Document the measured peak heap value and the final capacity in the Phase 10 report.

**Acceptance sub-criteria**:
- AC1~AC15 체크리스트가 모두 체크됨.
- Warm-cache vendor 요청 `transferSize === 0` 확인.
- S4 측정치와 lite-model 트리거 결정(필요 시) 문서화.
- iPhone SE peak heap 측정치와 최종 `RingBuffer.capacity` 문서화.

---

## File Inventory

### Iteration-2 delta (new or renamed files)
| Path | Purpose | Est. LOC | Introduced by |
|------|---------|---------:|---------------|
| `src/core/webview-host.ts` | WKWebView/Android WebView UA 감지 | 60 | Major #4 |
| `src/core/frame-view.ts` | `deriveFrameView` — downscaled view at score-time | 50 | Critical #1 |
| `src/ui/manual-capture-fallback.ts` | Tap-to-capture 경로 (장차법 대체) | 90 | Major #7 |
| `public/vendor/mediapipe/vision_wasm_internal.wasm` | same-origin WASM bundle | n/a | Critical #2 |
| `public/vendor/mediapipe/vision_wasm_internal.js` | same-origin WASM loader | n/a | Critical #2 |
| `public/vendor/mediapipe/face_landmarker.task` | same-origin 모델 | n/a | Critical #2 |
| `tests/unit/action-state-machine-invalidation.spec.ts` | FSM back-edge 증명 | 80 | Major #3 |
| `tests/unit/webview-host.spec.ts` | UA 분기 증명 | 60 | Major #4 |
| `tests/unit/frame-view.spec.ts` | 파생 view non-caching 증명 | 40 | Critical #1 |
| `tests/integration/reflection-rejection.spec.ts` | 업로드 Blob ≠ reflection frame | 120 | Major #5 |
| `tests/integration/webview-ua-fallback.spec.ts` | UA 스텁 폴백 경로 | 80 | Major #4 |
| `tests/fixtures/landmark-streams/head-tilt-during-blink.json` | FSM invalidation 입력 | n/a | Major #3 |
| `tests/fixtures/landmark-streams/face-lost-mid-action.json` | FSM invalidation 입력 | n/a | Major #3 |
| `tests/fixtures/ua-strings/*.txt` | WebView UA 픽스처 5종 | n/a | Major #4 |
| `tests/fixtures/synthetic-frames/reflection-burst.png` | Major #5 integration 입력 | n/a | Major #5 |

**Delta totals (iter2)**: +6 source files, +5 test files, +8 fixtures, ~580 LOC added, ~5MB vendor assets. Signatures in Phase 5 (`ring-buffer.ts`, `best-cut-scorer.ts`) and Phase 6 (`jpeg-encoder.ts`) are **rewritten** in-place (LOC deltas negligible but API-breaking vs. iter1).

### Iteration-3 delta (additional new files)
| Path | Purpose | Est. LOC | Introduced by |
|------|---------|---------:|---------------|
| `tests/unit/camera-module.callback.spec.ts` | AC7 `onComplete`/`onError` contract | 180 | Req #1 |
| `tests/unit/jpeg-encoder.spec.ts` | Path A / Path B / try-finally | 120 | Req #2 + Rec D |
| `tests/unit/jsp-shell-parity.spec.ts` | AC2 DOM snapshot | 80 | Rec B |
| `tests/unit/video-pipeline.permission.spec.ts` | AC11 denial path | 50 | Rec C |
| `tests/unit/video-pipeline.track-stop.spec.ts` | AC12 readyState ended | 40 | Rec C |
| `tests/fixtures/jsp-shell/MWPTBIM60000000.static.html` | Rendered JSP skeleton | n/a | Rec B |

**Iter3 delta totals**: +5 test files, +1 fixture, ~470 LOC added, 0 new source files. `src/module/types.ts` formalized (no new file; iter1 stub is filled in). `src/core/jpeg-encoder.ts` implementation skeleton has numbered-step branch logic (no signature change).

### Baseline inventory (iter1, still valid)

| Path | Purpose | Est. LOC | Depends on |
|------|---------|----------|------------|
| `package.json` | deps + scripts | 40 | — |
| `tsconfig.json` | TS config | 25 | — |
| `vite.config.ts` | dev server | 20 | vite |
| `esbuild.bundle.mjs` | IIFE 납품 번들 | 30 | esbuild |
| `vitest.config.ts` | unit test config | 15 | vitest |
| `playwright.config.ts` | browser test config | 20 | playwright |
| `index.html` | dev host | 30 | — |
| `src/main.ts` | dev entry | 20 | camera-module |
| `src/module/camera-module.ts` | public API (`CameraModule.start`) | 180 | core/*, ui/* |
| `src/module/types.ts` | shared types | 60 | — |
| `src/core/video-pipeline.ts` | getUserMedia lifecycle | 120 | — |
| `src/core/face-landmarker-runner.ts` | MediaPipe wrapper | 100 | @mediapipe/tasks-vision |
| `src/core/action-state-machine.ts` | FSM | 220 | metrics/ear, alignment |
| `src/core/ring-buffer.ts` | bounded frame store | 90 | — |
| `src/core/best-cut-scorer.ts` | weighted scorer | 110 | metrics/* |
| `src/core/metrics/laplacian.ts` | sharpness | 60 | — |
| `src/core/metrics/reflection.ts` | 빛반사 detect | 70 | — |
| `src/core/metrics/alignment.ts` | 정렬도 | 60 | — |
| `src/core/metrics/ear.ts` | Eye Aspect Ratio | 40 | — |
| `src/core/uploader.ts` | multipart POST | 80 | — |
| `src/core/jpeg-encoder.ts` | Canvas → JPEG Blob | 40 | — |
| `src/ui/overlay-renderer.ts` | canvas 가이드 draw | 150 | — |
| `src/ui/guide-assets.ts` | 타원 좌표 | 40 | — |
| `src/ui/help-text-controller.ts` | help_text 업데이트 | 70 | — |
| `src/ui/retry-ui.ts` | 재시도 UI | 80 | — |
| `src/ui/unsupported-fallback.ts` | 폴백 UI | 60 | — |
| `src/ui/a11y.ts` | aria 유틸 | 50 | — |
| `src/config/thresholds.ts` | 상수 | 50 | — |
| `src/config/mediapipe.ts` | WASM/model URL | 25 | — |
| `src/styles/pic-face.css` | 페이지 스타일 | 80 | — |
| `src/styles/camera-layout.css` | 레이어 스타일 | 50 | — |
| `jsp-shell/MWPTBIM60000000.jsp` | JSP shell | 80 | camera-module.iife.js |
| `jsp-shell/mock-header.html` | BNK 헤더 모사 | 40 | — |
| `server/src/index.ts` | Express app | 50 | express, cors |
| `server/src/routes/face-capture.ts` | upload route | 80 | multer |
| `server/src/storage.ts` | disk save | 50 | fs, uuid |
| `server/package.json` | server deps | 25 | — |
| `server/tsconfig.json` | server TS config | 15 | — |
| `tests/unit/*.spec.ts` (7 files) | unit | 600 total | vitest, core |
| `tests/integration/session-happy-path.spec.ts` | integration | 200 | vitest |
| `tests/browser/happy-path.spec.ts` | Playwright | 120 | playwright |
| `tests/fixtures/**` | synthetic frames + landmark streams | n/a (binary/json) | — |
| `README.md` | docs | 150 | — |
| **Total** (excl. fixtures) | | **~3500 LOC** | |
| **Files touched** | | **~42 source files** | |

---

## Dependencies

### Runtime (module)
```json
{
  "@mediapipe/tasks-vision": "^0.10.14"
}
```
- Loaded via CDN or copied to `public/vendor/mediapipe/` in POC. Model file: `face_landmarker.task`.

### Build
```json
{
  "typescript": "^5.4.0",
  "vite": "^5.2.0",
  "esbuild": "^0.21.0"
}
```

### Server
```json
{
  "express": "^4.19.0",
  "multer": "^1.4.5-lts.1",
  "cors": "^2.8.5",
  "uuid": "^9.0.1",
  "@types/express": "^4.17.21",
  "@types/multer": "^1.4.11",
  "@types/cors": "^2.8.17",
  "@types/uuid": "^9.0.8",
  "tsx": "^4.7.0"
}
```

### Test
```json
{
  "vitest": "^1.5.0",
  "@vitest/coverage-v8": "^1.5.0",
  "jsdom": "^24.0.0",
  "@playwright/test": "^1.43.0"
}
```

---

## Testing Strategy

### Unit (Vitest)
- **BestCutScorer**: 합성 3프레임 (sharp-noRefl-aligned, blurry-noRefl-aligned, sharp-refl-aligned) → 1번 프레임이 우승해야 함. AC5/AC9 직결.
- **ActionStateMachine**: 사전 녹화된 랜드마크 스트림 JSON을 feed → 예상 상태 전이 시퀀스 확인. 타임아웃·재시도 경로도 fake timer로 커버.
- **RingBuffer**: capacity eviction, `close()` 호출 검증(ImageBitmap spy), `clear()` 후 배열 비어있음.
- **개별 metrics**: laplacian/reflection/alignment/ear은 PNG/랜드마크 fixture 기반 deterministic 테스트.

### Integration (Vitest + jsdom + canvas mock)
- `session-happy-path.spec.ts`: 사전 녹화 프레임 시퀀스 → VideoPipeline stub → FaceLandmarkerRunner stub → FSM → RingBuffer → BestCutScorer → Uploader stub. 호출 순서와 인자 shape 검증.

### Browser (Playwright)
- `happy-path.spec.ts`: chromium launch with `--use-fake-device-for-media-stream --use-file-for-fake-video-capture=tests/fixtures/happy.y4m` → Vite dev server 접속 → `POST /api/face-capture` 요청 intercept.

### Manual device matrix (AC15)
- iPhone 13/14/15 (iOS 15, 16, 17) on Safari — 실기기 또는 BrowserStack.
- Galaxy S21/S22/S23 (Android 12, 13, 14) on Chrome 최신 2개 메이저.
- 체크리스트: 권한 허용/거부, 정상 시나리오 5초, 타임아웃 재시도, 나가기 버튼, LED off after unload.

---

## Risks & Mitigations (Top 5)

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **5초 세션 예산 초과** (AC8) — MediaPipe WASM + 모델 + getUserMedia warmup + align-hold 의 합이 5000ms 를 넘길 위험 | Med | High | **iter2: Performance Budget 섹션의 정량적 per-slot 표가 1차 방어선**. same-origin WASM/모델 번들, `Promise.all` 병렬(S3‖S4‖S5), `<link rel="preload">` 로 모델 선취, Phase 10 에서 실기기 측정으로 검증. 측정치 ≥ 4800ms 면 lite 모델로 다운그레이드. |
| 2 | **+5MB vendor bundle threatens AC8 on cold cache** (iter3, Req #3) — same-origin MediaPipe WASM(~1.5MB) + `face_landmarker.task`(~3.5MB) 자산이 cold-cache LTE 에서 S3+S4 합계 ~1050ms 를 차지. 첫 진입 사용자 또는 캐시 비어있는 사용자에게 AC8 5초 예산을 직접 위협 | Medium | High | **구체 완화책 5단계**: (1) `/public/vendor/mediapipe/*` 전체에 `Cache-Control: public, max-age=31536000, immutable` 헤더. (2) 버전-해시 파일명 (`mediapipe-tasks-vision-<sha>.wasm`, `face_landmarker-<sha>.task`) 으로 immutable 캐시 무효화 없이 업데이트. (3) JSP `<head>` 에 `<link rel="preload" as="fetch" href="/vendor/mediapipe/face_landmarker-<sha>.task" crossorigin>` **및** WASM binary 에도 동일 preload hint. (4) **Lite model downgrade trigger**: Phase 10 에서 측정한 S4 > 800ms 이면 `face_landmarker_lite.task` 로 스왑 후 재측정 (threshold 명시). (5) Warm-cache 검증: 두 번째 방문 시 vendor 파일 `transferSize === 0` 을 Phase 10 수동 스크립트 `performance.getEntriesByType('resource')` 로 assert. |
| 3 | **빛반사 false positive** → 유효 프레임 배제되어 세션 실패율 ↑ (iter3 Rec A: 완화책 구체화) | Medium | High | **정량 정책**: (a) 기본 가중치 `w1:w2:w3 = 0.4:0.3:0.3` 를 `thresholds.ts` 에 하드코딩(spec 튜닝값). (b) **Tuning trigger**: 내부 테스트 세션의 >5% 에서 reflection-false-reject(유효한데 반사 점수로 탈락) 발생 시 `w2` 를 0.05 감소 후 재측정. (c) **Telemetry hook**: `BestCutScorer` 가 `lastScoreBreakdown: { sharpness, reflection, alignment }` 를 노출해 dev/staging 에서 로깅 가능. (d) **Safe default boundary**: `w2 >= 0.2` 를 하한(below 면 반사가 실질적으로 무시됨). (e) `reflection.ts` 는 **얼굴 bbox 내부만** 휘도 분석 (base). |
| 4 | **메모리 누수** — RingBuffer eviction 시 ImageBitmap `close()` 누락 → 모바일 크래시 | Medium | High | iter2 Phase 5 의 소유권 이전 모델(`detach`/`close`) + `estimatedBytes()` 가드 + 단위 테스트 spy + Phase 10 DevTools Memory 스냅샷. Full-res 소유로 메모리 footprint 가 증가했으므로(18MB) 모니터링 우선순위가 높다. |
| 5 | **굿뱅크 WebView 호환 실패** — 호스트 앱이 `allowsInlineMediaPlayback` 등 필요 설정을 누락했을 경우 iOS WKWebView 에서 카메라 블랙스크린 | Medium | High | iter2 Phase 2 `webview-host.ts` 로 감지, `#unsupported_container` 폴백 + README 에 호스트 앱 요구사항 문서화. 실 앱 버전 검증은 운영 이식 단계 follow-up. |

---

## ADR (Architecture Decision Record)

### Decision
**Vanilla TypeScript 단일 IIFE 번들(+ ESM-clean core)** 로 카메라 모듈을 제공하고, `src/core/*`는 프레임워크 비의존·순수 함수/클래스로 구성해 운영 이식성과 테스트 가능성을 동시에 확보한다. MediaPipe FaceLandmarker를 WASM으로 온디바이스 실행, 링버퍼에 20프레임 축소본+메트릭만 유지, `laplacian × reflection-free × alignment` 가중합으로 베스트컷을 선정하여 단일 JPEG을 `POST /api/face-capture`로 업로드한다.

### Drivers
1. spec Constraint 1–2(line 45–46): ib20 + JSP + Vanilla JS 스택, 독립 JSP 라우트 페이지 + IIFE 번들.
2. spec Technical Context(line 129–137): Vanilla JS(+TS), MediaPipe Tasks Vision, Canvas2D 수동 연산(OpenCV.js 회피).
3. AC5 + AC9 + AC13(line 86, 92, 96): 3축 베스트컷, 빛반사 배제 실증, 메모리 휘발.
4. ANALYSIS lines 22–66: 기존 `.pic_idcard` DOM·z-index·클래스 규약을 쌍둥이로 답습.

### Alternatives considered
- **Option B (ESM `<script type="module">`)**: ib20/jQuery 전역 환경과 혼용 리스크. 2차 후보.
- **Option C (OpenCV.js)**: 8~10MB WASM 추가 → 모바일 진입 지연 → spec Technical Context에 의해 무효화.
- **Option D (MediaRecorder + 서버 베스트컷)**: spec Constraint 6 "단일 JPEG 1장"에 의해 무효화.
- **React/Vue 전환**: Constraint 1에 의해 무효화.
- **Face-api.js** 대체: 모델 정확도/성능/iOS Safari 호환 편차 → MediaPipe가 spec Constraint 4로 이미 확정.

### Why chosen
- **운영 이식성**: Vanilla TS + IIFE는 ib20 JSP에 `<script>` 1줄로 편입. 사내 번들 관행(`?v=V...` cache busting)과 호환.
- **테스트 가능성**: Core를 ESM 순수 모듈로 두면 Vitest 단위 테스트가 자연스럽고, `fixtures/landmark-streams` 기반 결정론적 검증 가능.
- **시각·DOM 대칭**: `.pic_face` 클래스 스왑으로 ANALYSIS 인용 구조를 class/z-index/header/exit-button/brand-color parity 수준으로 재현 → 사용자 학습비용 0. (얼굴 가이드 기하는 의도적으로 타원)
- **성능·정확도 균형**: 축소본 기반 Laplacian + 얼굴 bbox 내부 휘도 분석으로 OpenCV.js 없이도 AC9 달성 가능.
- **메모리 불변속성**: RingBuffer가 bitmap 수명주기의 단일 책임자 → AC13/Constraint 10 위반 면 최소화.

### Consequences

**Positive**:
- 프레임워크 록인 없음 → 운영 이식 시 JS/CSS 파일만 교체.
- Core가 테스트 가능하므로 regression 안전망 구축 가능.
- DOM·CSS 대칭으로 디자인 리뷰 코스트 최소화.
- IIFE 번들은 공용 jQuery/Bootstrap 환경에 부작용 없음.

**Negative**:
- 듀얼 빌드 파이프라인(Vite + esbuild IIFE) 유지 비용.
- MediaPipe 첫 로드 지연(Risk #1 + Risk #2) 을 same-origin 번들 + preload + immutable cache + lite-model 트리거로 방어. +5MB vendor footprint 는 배포 관리 비용을 수반 (Risk #2 의 5단계 완화책으로 추적).
- Canvas2D 수동 Laplacian은 OpenCV 대비 최적화 여지 제한(단, POC 타겟 프레임률로는 충분).
- 운영 이식 단계에서 `#face_auto_capture` 신규 ID 가 사내 legacy 셀렉터와 교차 검증 필요(Follow-up #8).

### Follow-ups (운영 이식 단계)
1. 사내 저장소에서 `mwp.js` 공용 번들 확인 후 jQuery/AJAX helper 재사용 여부 결정 (ANALYSIS line 258).
2. 실 업로드 엔드포인트·스키마 획득 후 `Uploader` endpoint/서명 헤더 교체 (ANALYSIS line 257).
3. 권한 거부 리다이렉트 경로 확인(`MWPCMNERR000001` 여부) (ANALYSIS line 256).
4. Quram 솔루션 역할 확인 후 전·후처리 hook 추가 여부 결정 (ANALYSIS line 259).
5. 가중치 w1:w2:w3을 실측 데이터로 튜닝 (spec line 122).
6. 가이드 타원 에셋 디자인 완성 (브랜드 옐로우 stroke 기준, 현재는 Canvas draw).
7. 굿뱅크 앱 실기기에서 `allowsInlineMediaPlayback` 등 WKWebViewConfiguration 확인(POC 에서는 가정만 문서화).
8. `#auto_snap` vs `#face_auto_capture` — 실 기존 코드에 `#auto_snap` 셀렉터 의존이 있는지 사내 저장소 확인 후 최종 결정.

---

### ADR addendum — Iteration 2 (post-Architect NEEDS_ITERATION)

**Decision delta**: 아키텍트 피드백 9건(Critical 2 + Major 6 + Minor 1)에 대응하여 설계의 **소유권·병렬성·폴백 경로**를 강화한다. Locked decisions 는 변경되지 않는다.

**What changed**:
1. **Frame ownership inverted** — RingBuffer 가 full-res `ImageBitmap` 의 단일 소유자. 점수 계산은 파생 view 로, 업로드는 동일 bitmap 으로. "scored frame = uploaded frame" 을 type-level invariant(I-5)로 고정.
2. **Performance Budget promoted to Phase 1.5** — 정량 ms per-slot 표, `Promise.all` 병렬 계약(I-1), same-origin WASM 강제(I-2). 과거의 "splash 로 흡수" 완화책은 유지하되 예산 초과를 감추는 수단이 아님을 I-3 로 명시.
3. **FSM invalidation back-edges** — `BLINK_DETECTING` 에서 alignment 손상 / 얼굴 소실 시 `ALIGNING` 으로 복귀 + EAR 버퍼 clear. head-tilt false positive 차단.
4. **WebView first-class** — 굿뱅크 WebView 는 production target 으로 격상, Phase 2 에 `webview-host.ts` 와 `visibilitychange` 처리, README 호스트 앱 요구사항 문서화.
5. **Manual capture fallback** — 깜빡임 불가 사용자에게 legacy 탭 캡처 경로를 공식 장차법 대체 경로로 제공.
6. **Parity contract restated** — "pixel parity" 용어 제거, class/z-index/header/exit-button/brand-color parity 로 한정. 얼굴 가이드 = 타원은 의도된 설계.
7. **New ID `#face_auto_capture`** — `#auto_snap` 재사용 불확실성 제거, 스타일 parity 는 `.btn_camera` class 로 보존.
8. **AC9 E2E 증명** — unit scorer 테스트에 더해 integration 테스트가 업로드 Blob 의 pixel hash 를 reflection-burst 프레임과 비교.
9. **visibilitychange handling** — iOS Safari 탭 전환 시 stream stop + 복귀 시 재취득 경로.

**New Consequences**:
- **Positive**: Production host(WebView) 가 테스트 매트릭스의 1급 시민이 됨. 장차법 대체 경로가 설계 단계에 포함됨. AC9 증명이 end-to-end 로 상승. 성능 예산이 설계-시 제약으로 올라와 리뷰 가능.
- **Negative/Trade-offs**:
  - 메모리 footprint 상승(thumb 기반 → full-res 20 프레임 ≈ 18MB). iOS Safari 구기종 한계 접근 가능성 → Phase 10 측정 우선 항목.
  - Same-origin WASM 번들링은 빌드 산출물 크기를 키움(vendor assets ~5MB). 배포 번들 관리 필요.
  - FSM 상태 수 증가(`MANUAL_FALLBACK` + invalidation 전이) → 테스트 표면적 증가.
  - `#face_auto_capture` 가 사내 legacy 셀렉터와 충돌할 수도 있음(역방향 리스크) — Follow-up #8 로 추적.

**Decision status**: Locked decisions 보존, 추가 설계 결정 9건 추가. Architect 재리뷰 대상.

---

### ADR addendum — Iteration 3 (post-Critic ITERATE)

**Decision delta**: Critic 피드백 (Required 3 + Recommended 5) 에 대응해 **공개 API 계약, 인코더 호환성, 번들 크기 리스크** 를 코드-수준 검증 가능한 형태로 승격한다. Locked decisions 및 아키텍처 경계는 변경되지 않는다(Architect 는 iter2 에서 이미 APPROVE).

**What changed**:
1. **`SessionResult` / `SessionError` formalized (Req #1)** — `types.ts` 에 구체 shape 와 6종 error code enum 을 정의. AC7 콜백 계약이 type-level 로 존재하며 `tests/unit/camera-module.callback.spec.ts` 로 happy + 4 error paths end-to-end 검증.
2. **`OffscreenCanvas.convertToBlob` feature-detect fallback (Req #2)** — Phase 6 의 inline 주석을 **formal acceptance sub-criterion** 으로 승격, `encodeJpeg` 에 numbered-step 분기(Path A: OffscreenCanvas / Path B: HTMLCanvasElement.toBlob) 명시. iOS 15.0/16.0/16.3 사용자 보호. `tests/unit/jpeg-encoder.spec.ts` 로 양쪽 경로 + 예외 경로 모두 검증.
3. **+5MB bundle risk promoted (Req #3)** — Risk #2 를 "playsinline 해결됨" 에서 "+5MB vendor bundle threatens AC8 on cold cache" 로 교체. 5단계 구체 완화책: immutable 캐시 헤더, 버전 해시 파일명, preload hints, lite-model 다운그레이드 트리거 (S4>800ms), warm-cache assertion.
4. **Try/finally in encoder (Rec D)** — `encodeJpeg` 가 어떤 경로로 실패하든 `bestFrame.close()` 가 반드시 실행되도록 함. `tests/unit/jpeg-encoder.spec.ts` 가 `ctx.drawImage` throw 시나리오로 검증.
5. **Risk #3 (reflection false positive) 구체화 (Rec A)** — 벙어리 knob "튜닝 가능" → 정량 정책 5개 (기본 w1:w2:w3, tuning trigger, telemetry hook, safe floor, bbox 분석).
6. **AC2 DOM snapshot test (Rec B)** — `tests/unit/jsp-shell-parity.spec.ts` 가 JSP static fixture 의 모든 필수 selector 와 z-index 를 assert.
7. **AC11 / AC12 unit tests (Rec C)** — `video-pipeline.permission.spec.ts`, `video-pipeline.track-stop.spec.ts` 추가.
8. **Phase 10 memory-pressure trigger (Rec E)** — iPhone SE peak JS heap > 60MB → `RingBuffer.capacity` 20 → 12 다운그레이드 rule.

**New Consequences**:
- **Positive**:
  - AC7 이 processing invariant 가 아니라 type-level + test-level contract 로 존재 → 실행기/리뷰어의 모호성 0.
  - iOS 15~16.3 사용자가 런타임 `undefined` 에 부딪힐 경로가 test 로 방어됨.
  - 번들 크기가 ADR Negative 에서 top-5 Risk 로 승격 → 실기기 측정 시 명시적 체크리스트 항목.
  - 빛반사 가중치 튜닝이 주관적 노브에서 정량 트리거 + 안전 하한으로 전환.
- **Negative/Trade-offs**:
  - Phase 9 테스트 개수 증가(+5 unit specs). 초기 테스트 작성 코스트 상승.
  - Phase 10 수동 검증 단계가 추가 측정(warm-cache transferSize, S4 cold, iPhone SE heap)을 포함 → 소요 시간 증가.
  - JSP static fixture 를 `tests/fixtures/jsp-shell/` 에 동기화 유지해야 하는 경미한 drift 리스크.

**What did NOT change (Architect bound preserved)**:
- 아키텍처 레이어(core / ui / module 분리), 번들 전략(Monolithic IIFE), 프레임 소유권 모델(iter2 Phase 5), FSM 구조, WebView 감지, Performance Budget 표, 모든 locked decisions.

**Decision status**: Locked decisions 보존, iter3 에서 8개 추가 결정. Critic 재리뷰 대상 (Architect 는 iter2 에서 APPROVE 상태 유지).
