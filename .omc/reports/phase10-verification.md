# Phase 10 Verification Report

**Date**: 2026-04-11  
**Verifier**: verifier agent  
**Overall Verdict**: ⚠️ CONDITIONAL PASS

---

## Verdict

**Status**: CONDITIONAL PASS  
**Confidence**: high  
**Blockers**: 1 — 4 TypeScript errors in test files (not src); tests pass at runtime but strict tsc fails  
**Non-blockers**: AC8 (perf budget) and AC15 (device matrix) require real-device measurement

---

## Evidence

| Check | Result | Command | Output |
|-------|--------|---------|--------|
| Build | ✅ PASS | `npm run build` | 18.29 kB IIFE (gzip 6.11 kB), 14 modules, exit 0 |
| Typecheck — src only | ✅ PASS | `tsc --noEmit \| grep "^src/"` | 0 errors |
| Typecheck — full | ❌ FAIL | `npm run typecheck` | 4 errors in test files only (see §Gaps) |
| Unit + Integration | ✅ PASS | `npm run test` | 64/64 passed, 14 spec files, exit 0 |
| Browser (Playwright) | ✅ PASS | `npm run test:browser` | 1/1 passed, exit 0 |
| Lint | N/A | — | No lint script configured |

---

## Build Details

```
dist/camera-module.iife.js  18.29 kB │ gzip: 6.11 kB
✓ built in 104ms  (14 modules transformed)
```

- Bundle is **18 kB** — well within the 2 MB IIFE budget
- 14 modules transformed (all stubs replaced with real implementations)
- Note: MediaPipe WASM/model files are loaded at runtime via CDN/`/vendor/` path, not bundled — correct per plan

**Dev-harness fix applied**: `src/main.ts` was calling `CameraModule.start()` without `videoEl`, causing a console error that failed the browser smoke test. Fixed by querying `.video_wrapper video` and `#overlay_canvas` from `index.html` before calling `start()`. This is a dev-entry-point fix; no module code was touched.

---

## Tests

```
✓ tests/unit/webview-host.spec.ts              (12 tests)
✓ tests/unit/ear.spec.ts                       (7 tests)
✓ tests/unit/ring-buffer.spec.ts               (6 tests)
✓ tests/unit/jpeg-encoder.spec.ts              (5 tests)
✓ tests/unit/action-state-machine.spec.ts      (4 tests)
✓ tests/unit/best-cut-scorer.spec.ts           (4 tests)
✓ tests/unit/camera-module.callback.spec.ts    (6 tests)
✓ tests/integration/session-happy-path.spec.ts (1 test)
✓ tests/integration/reflection-rejection.spec.ts (1 test)
✓ tests/unit/video-pipeline.track-stop.spec.ts (2 tests)
✓ tests/unit/jsp-shell-parity.spec.ts          (8 tests)
✓ tests/unit/video-pipeline.permission.spec.ts (2 tests)
✓ tests/unit/reflection.spec.ts                (4 tests)
✓ tests/unit/action-state-machine-invalidation.spec.ts (2 tests)

Test Files  14 passed (14)
     Tests  64 passed (64)
  Duration  888ms
```

---

## FSM Bug Fix Verification (lane-b handoff item)

**Finding**: VERIFIED FIXED.

The fix is in `src/core/action-state-machine.ts: isInvalidatingFrame()` (lines 271–282):

```typescript
private isInvalidatingFrame(metrics: FrameMetrics): boolean {
  if (isFaceLost(metrics)) {
    this.faceLostStreak += 1;
    return this.faceLostStreak >= this.cfg.faceLostFrameThreshold;  // ← threshold gate
  }
  const aligned = evaluateAlignment(metrics, this.cfg.alignment).aligned;
  if (!aligned) return true;
  this.faceLostStreak = 0;  // ← reset only on healthy aligned frame
  return false;
}
```

Both `handleAlignHold` and `handleBlinkDetecting` delegate to this method without unconditionally resetting `faceLostStreak`. The default `faceLostFrameThreshold = 2` is used in the `ActionStateMachine()` default config.

**Evidence**: `face-lost-mid-action.json` fixture feeds 2 consecutive null-landmark frames at timestamps 1240 and 1300. The test `"two consecutive face-lost frames return to aligning"` passes as part of the 64/64 suite using the default threshold — no `faceLostFrameThreshold=1` workaround needed.

---

## Performance Budget

**Status**: ARCHITECTURE VERIFIED; runtime measurement requires real device.

| Slot | Plan (ms) | Measurable? | Architecture Evidence |
|------|-----------|-------------|----------------------|
| S1 DOM ready | ~50 | ✅ measured | Browser smoke: page loads in ~295ms total |
| S2 Camera warmup | ~500 | ⚠️ real device only | VideoPipeline single-instance guard prevents double-prompt |
| S3 MediaPipe WASM+model | ~1500 | ⚠️ real device only | FaceLandmarkerRunner loads WASM lazily |
| S4 FaceLandmarker.init | ~800 | ⚠️ real device only | Lite-model downgrade trigger at 800ms in thresholds.ts |
| S5 Parallel start overhead | ~100 | — | CameraModule uses Promise.all for camera + MediaPipe |
| S6 Align-hold (fixed) | 1000 | ✅ unit test | `ALIGN_HOLD_MS = 1000` in thresholds.ts; ASM spec verifies |
| S7 Blink window | ~500 | — | EAR rolling window verified in ear.spec.ts |
| S8 Scoring+encode | ~100 | — | BestCutScorer + jpeg-encoder both synchronous-capable |
| S9 Upload | ~300 | — | Uploader with 5xx retry |
| S10–S11 Cleanup+ack | ~150 | — | teardown() + settled flag |
| **Total budget** | **5000ms** | ⚠️ | Requires real-device profiling |

**Defined downgrade triggers** (in `thresholds.ts`):
- `PERF_S4_LITE_DOWNGRADE_TRIGGER_MS = 800` — if S4 > 800ms, switch to lite model
- `PERF_BUDGET_TOTAL_MS = 5000` — total session cap
- `PERF_PEAK_HEAP_DOWNGRADE_TRIGGER_MB = 60` — ring-buffer capacity 20→12

---

## Memory (iPhone SE profile)

**Status**: CANNOT MEASURE in headless CI — requires Chrome DevTools heap snapshot on real device or full emulation session with real MediaPipe.

- **Theoretical worst-case**: `RING_BUFFER_CAPACITY (20) × 640 × 360 × 4 bytes = 18.4 MB` ring buffer alone
- **Downgrade rule**: `RING_BUFFER_CAPACITY` in `thresholds.ts` — reduce 20→12 if peak heap > 60 MB on iPhone SE profile
- **I-7 (bitmap close) verified**: `RingBuffer.push()` calls `evicted.close()` on overflow; `RingBuffer.clear()` calls `f.close()` on all frames; `jpeg-encoder.ts` closes the winning frame in `finally` block
- **AC13 (Blob release) verified**: `Uploader.upload()` sets `this.pending = null` in `finally` block

---

## Warm-Cache Assertion

**Status**: ARCHITECTURE VERIFIED; cannot run second-visit assertion without a real deployment with `Cache-Control: immutable` headers.

The browser smoke test confirms `getUserMedia` and page load work cleanly on first visit. Immutable cache headers for `/vendor/mediapipe/*` assets must be verified at the deployment/CDN level during production port.

---

## AC Coverage

| AC | Criterion | Status | Evidence |
|----|-----------|--------|----------|
| AC1 | iOS/Android getUserMedia → preview → session | ✅ VERIFIED | `VideoPipeline` with `facingMode:"user"`, `playsinline`, `webkit-playsinline`; `video-pipeline.permission.spec.ts` 2/2; browser smoke 1/1 |
| AC2 | BNK header + exit button parity with MWPTBIM50000000 | ✅ VERIFIED | `jsp-shell-parity.spec.ts` 8/8; JSP shell HTML matches reference DOM structure |
| AC3 | 1-second align hold before blink prompt | ✅ VERIFIED | `action-state-machine.spec.ts` 4/4; `ALIGN_HOLD_MS=1000` constant; FSM `handleAlignHold` measures elapsed time |
| AC4 | EAR blink detection via MediaPipe landmarks | ✅ VERIFIED | `ear.spec.ts` 7/7; `action-state-machine.spec.ts` 4/4; EAR closed threshold 0.18, open 0.24 |
| AC5 | 3-axis weighted best-cut scoring | ✅ VERIFIED | `best-cut-scorer.spec.ts` 4/4; weights 0.4:0.3:0.3; min-max normalization per axis |
| AC6 | Single JPEG encode + upload to endpoint | ✅ VERIFIED | `session-happy-path.spec.ts` 1/1; `jpeg-encoder.ts` dual-path; `uploader.ts` multipart POST |
| AC7 | Callback contract — exactly-once, mutual exclusion | ✅ VERIFIED | `camera-module.callback.spec.ts` 6/6; `settled` flag in `CameraSession`; `emitComplete`/`emitError` both guard on `if (this.settled) return` |
| AC8 | 5-second session budget | ⚠️ PARTIAL | Architecture ready (parallel init, thresholds defined); runtime measurement requires real device |
| AC9 | Reflection frames rejected from best-cut selection | ✅ VERIFIED | `reflection-rejection.spec.ts` 1/1; luminance histogram on face-bbox ROI; `reflectionScore()` = 1 − ratio |
| AC10 | Timeout (15s) + retry UI; retry-exceed → failure | ✅ VERIFIED | `action-state-machine.spec.ts`; `SESSION_TIMEOUT_MS=15000`, `MAX_RETRIES=3`; `handleRetryOrFail` → `retryExhaustedListeners` |
| AC11 | Permission denied → message + back navigation | ✅ VERIFIED | `video-pipeline.permission.spec.ts` 2/2; `onPermissionDenied` callback + `webview_unsupported` error code |
| AC12 | Page unload → all tracks stopped, camera LED released | ✅ VERIFIED | `video-pipeline.track-stop.spec.ts` 2/2; `stop()` calls `track.stop()` on all tracks; `readyState === "ended"` checked |
| AC13 | No LocalStorage/IndexedDB; memory released after upload | ✅ VERIFIED | No `localStorage`/`indexedDB` calls in any src file (grepped); `Uploader` nulls Blob in `finally`; `jpeg-encoder` closes bitmap in `finally`; `RingBuffer.clear()` closes all frames |
| AC14 | Mock server receives, saves JPEG + metadata to disk | ✅ VERIFIED | `src/server/index.ts`: multer receives multipart; `writeFileSync` saves `{uuid}.jpg` + `{uuid}.json` to `tmp/uploads/`; `GET /health` endpoint for readiness check |
| AC15 | DevTools device emulation manual regression | ⚠️ PARTIAL | Browser smoke test (Playwright + fake media) covers DOM structure and getUserMedia on Chromium; full iOS Safari / Galaxy manual sweep requires real devices |

**Fully verified**: 13/15 (AC1-7, AC9-14)  
**Partial / requires real device**: 2/15 (AC8, AC15)  
**Missing**: 0/15

---

## Risk Mitigation Audit

| Risk | Description | Status | Evidence |
|------|-------------|--------|---------|
| Risk 1 | 5s performance budget exceeded | ⚠️ ARCHITECTURE READY | Parallel init (Promise.all), lite-model downgrade trigger at S4>800ms in thresholds.ts; runtime measurement deferred to real device |
| Risk 2 | +5 MB MediaPipe vendor on repeat visits | ⚠️ ARCHITECTURE READY | Vendor files loaded separately from IIFE bundle (18 kB); warm-cache requires `Cache-Control: immutable` headers at deploy time |
| Risk 3 | Reflection false-positive rate | ✅ MITIGATED | Default weights 0.4:0.3:0.3 in thresholds.ts; `SCORE_W2_FLOOR=0.2` prevents w2 from being tuned below safe floor; `BestCutScorer.lastScoreBreakdown` telemetry accessor available for staging logging |
| Risk 4 | Memory leak (RingBuffer bitmaps) | ✅ MITIGATED | I-7: eviction → `close()`, `clear()` → `close()` all frames; encoder `finally` closes winning frame; uploader `finally` nulls Blob; no additional close() paths missing |
| Risk 5 | WebView host failure | ✅ MITIGATED | `webview-host.spec.ts` 12/12; `detectHost()` distinguishes ios_wkwebview/android_webview/browser; `VideoPipeline.isSupported()` gate; `webview_unsupported` error code defined and wired |

---

## Typecheck Gaps (Remediation Required)

4 errors in test files — src is clean.

| Location | Error | Severity | Fix |
|----------|-------|----------|-----|
| `ear.spec.ts:14,17` | `NormalizedLandmark` requires `visibility` field; `{x,y,z}` insufficient | Medium | Add `visibility: 1` to `makeLandmarks()` push (line 14 and array init) |
| `camera-module.callback.spec.ts:167` (×2) | `Mock<[r: SessionResult], void>` not assignable to `Mock<any[], unknown>` — Vitest 1.6 Mock generic variance | Medium | Cast spies as `vi.fn() as unknown as Mock<any[], unknown>` or widen spy type annotation |

These 4 errors do not affect runtime (vitest transpiles with esbuild, which skips type-checking). However a CI gate that runs `tsc --noEmit` will fail. **Recommend fixing before production port.**

---

## Implementation Audit (Final)

| Module | File | Status |
|--------|------|--------|
| Types + constants | `src/module/types.ts`, `thresholds.ts` | ✅ Complete |
| CameraModule orchestrator | `src/module/camera-module.ts` | ✅ Complete — full DI-wired, AC7 settled flag |
| VideoPipeline | `src/core/video-pipeline.ts` | ✅ Complete — getUserMedia, iOS inline, visibility handler |
| FaceLandmarkerRunner | `src/core/face-landmarker-runner.ts` | ✅ Complete |
| ActionStateMachine | `src/core/action-state-machine.ts` | ✅ Complete — 14-state FSM, FSM bug fixed |
| RingBuffer + RingFrame | `src/core/ring-buffer.ts` | ✅ Complete — I-5, I-7 enforced |
| BestCutScorer | `src/core/best-cut-scorer.ts` | ✅ Complete — 3-axis, min-max normalize, telemetry |
| ReflectionDetector | `src/core/reflection.ts` | ✅ Complete — face-bbox luminance histogram |
| JpegEncoder | `src/core/jpeg-encoder.ts` | ✅ Complete — OffscreenCanvas + HTMLCanvas fallback |
| Uploader | `src/core/uploader.ts` | ✅ Complete — multipart POST, 5xx retry, AC13 |
| Mock Server | `src/server/index.ts` | ✅ Complete — Express, multer, JPEG+meta to disk |
| UI / OverlayRenderer | `src/ui/overlay-renderer.ts` | ✅ Complete |
| A11y utilities | `src/ui/a11y.ts` | ✅ Complete |
| WebView host detection | `src/core/webview-host.ts` | ✅ Complete (12 tests) |

All 14 modules fully implemented (0 stubs remaining).

---

## Overall Verdict

**CONDITIONAL PASS**

The implementation is functionally complete and test-verified. All 15 ACs are either fully verified (13) or architecturally sound with deferred real-device measurement (2). The FSM faceLostStreak bug is confirmed fixed. The browser smoke test passes.

### Remediation required before production port

1. **Fix 4 TypeScript errors in test files** (ear.spec.ts, camera-module.callback.spec.ts) — prevents CI typecheck gate from passing
2. **Real-device performance profiling** (AC8) — measure S1–S11 against 5000ms total budget on iPhone SE and Android Chrome; trigger lite-model if S4 > 800ms
3. **Memory profiling on iPhone SE** — Chrome DevTools heap snapshot at peak; downgrade `RING_BUFFER_CAPACITY` 20→12 in `thresholds.ts` if peak > 60 MB
4. **Warm-cache verification** — deploy with `Cache-Control: immutable` on `/vendor/mediapipe/*`; verify `transferSize === 0` on second visit
5. **Manual device matrix** (AC15) — iOS Safari 15.0, 15.8, 16.0, 16.3, 16.4+, 17.x; Android Chrome latest 2 majors

### Follow-ups for production port

1. Replace mock server (`src/server/index.ts`) with real ib20 channel `POST` endpoint
2. Add CSP headers for MediaPipe WASM/SIMD sources
3. NetFunnel integration at parent flow level (Constraint 9 — not in this module's scope)
4. Replace `index.html` dev host with real JSP shell (`MWPTBIM6xxx`)
5. Add telemetry for Risk 3 monitoring (`lastScoreBreakdown` → staging log pipeline)
