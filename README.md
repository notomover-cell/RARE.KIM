# 부산은행 모바일웹 얼굴 촬영 모듈 — POC 전달 패키지

비대면실명확인 플로우 내 **액티브 라이브니스 얼굴 촬영 모듈** POC 소스 + 개발 이식 문서.

---

## 📦 패키지 내용

| 경로 | 내용 |
|------|------|
| `docs/개발요청서-얼굴촬영모듈.md` | 요구사항, 아키텍처, API 계약, 수락 기준 (524라인) |
| `docs/검증리포트-얼굴촬영모듈.md` | verify + 보안 + 코드 품질 리뷰 (282라인) |
| `.omc/specs/deep-interview-mw-camera.md` | 요구사항 스펙 (Deep Interview 결과) |
| `.omc/plans/ralplan-mw-camera.md` | 상세 구현 계획 (1092라인) |
| `.omc/reports/phase10-verification.md` | POC Phase 10 검증 리포트 |
| `reference/existing-id-capture/ANALYSIS.md` | 기존 `MWPTBIM50000000` DOM/CSS 분석 |
| `reference/existing-id-capture/extracted/` | 기존 페이지 HTML/CSS/이미지 추출본 |
| `src/` | POC TypeScript 소스 (운영 이식 베이스) |
| `tests/` | Vitest 유닛 + 통합 + Playwright 테스트 (64 passing) |
| `public/vendor/mediapipe/` | MediaPipe Tasks Vision WASM + 모델 (15MB, 재다운로드 불필요) |
| `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json` | 빌드 설정 |

**제외된 파일**: `node_modules/`, `dist/`, `tmp/`, `.omc/state/`, `test-results/`, `.claude/`

---

## 🚀 빠른 실행 (검증용)

```bash
# 의존성 설치
npm install

# 타입체크 + 빌드
npm run typecheck
npm run build     # → dist/camera-module.iife.js (18.29 kB)

# 유닛 + 통합 테스트
npm run test      # 64/64 passing

# Playwright 브라우저 테스트 (주의: 현재 POC DOM 변형으로 1건 회귀)
npm run test:browser

# POC 데모 실행
# 1. Mock 업로드 서버
npm run mock-server          # → http://localhost:3001

# 2. Vite 개발 서버 (새 터미널)
npm run dev                   # → http://localhost:5173
```

**카메라 테스트는 HTTPS 필수** (localhost 제외). 실기기 테스트는 Cloudflare Tunnel 또는 사내 HTTPS 개발 도메인 사용:
```bash
brew install cloudflared      # Mac
cloudflared tunnel --url http://localhost:5173
```

---

## 📂 핵심 소스 파일 가이드

```
src/
├── main.ts                       ← POC 엔트리 (프레임 루프, 데모용, 운영 이관 시 CameraModule로 통합)
├── module/
│   ├── camera-module.ts          ← 공개 API (CameraModule.start)
│   ├── types.ts                  ← SessionResult/SessionError 계약
│   └── thresholds.ts             ← 튜닝 가능 임계값 (단일 출처)
├── core/
│   ├── video-pipeline.ts         ← getUserMedia 생명주기, playsinline, visibilitychange
│   ├── webview-host.ts           ← WKWebView/Android WebView/굿뱅크 UA 탐지
│   ├── face-landmarker-runner.ts ← MediaPipe 래퍼 (GPU→CPU 폴백)
│   ├── action-state-machine.ts   ← 11-state FSM + invalidation back-edges
│   ├── ring-buffer.ts            ← 단일 소유권 ImageBitmap 버퍼 (I-5, I-7)
│   ├── frame-view.ts             ← 다운스케일 뷰 (I-6, 비캐싱)
│   ├── best-cut-scorer.ts        ← 3축 가중합 (선명도×빛반사×정렬도)
│   ├── reflection.ts             ← 얼굴 bbox 휘도 히스토그램
│   ├── metrics/
│   │   ├── ear.ts                ← Eye Aspect Ratio + 블링크 감지
│   │   ├── laplacian.ts          ← 선명도
│   │   └── alignment.ts          ← 정면 정렬 게이트
│   ├── jpeg-encoder.ts           ← OffscreenCanvas Path A / HTMLCanvasElement.toBlob Path B
│   └── uploader.ts               ← multipart POST + 5xx 재시도
├── ui/
│   ├── jsp-shell.html            ← 운영 JSP 템플릿 예시 (.pic_face 미러)
│   ├── styles.css                ← CSS (기존 MWPTBIM50000000 컨벤션 미러)
│   ├── ui-controller.ts          ← DOM ↔ CameraModule 바인딩
│   ├── overlay-renderer.ts       ← 타원 가이드 + 딤 오버레이
│   ├── manual-capture-fallback.ts ← 수동 촬영 대체 경로 (장차법)
│   ├── unsupported-container.ts  ← getUserMedia 미지원 폴백
│   ├── help-text-controller.ts   ← 안내문 aria-live
│   └── a11y.ts                   ← 접근성 유틸
├── config/
│   └── mediapipe.ts              ← WASM/모델 same-origin 경로 (Invariant I-2)
└── server/
    └── index.ts                  ← Mock Express 업로드 서버 (POC만)
```

---

## ⚠️ 운영 이식 전 필수 작업

`docs/검증리포트-얼굴촬영모듈.md` §4.1 참조. 우선순위:

1. **[보안]** `showStatus`의 `innerHTML` → `textContent` 전환
2. **[보안]** `pagehide`/`beforeunload`에 `videoPipeline.stop()` + `ringBuffer.clear()` 배선
3. **[보안]** `multer@^2.0.0` + `limits.fileSize=2MB` + `fileFilter image/jpeg`
4. **[코드]** FSM 재시도 경로에서 `sessionStartedAt` 초기화
5. **[코드]** EAR gray zone(0.12~0.18) tri-state 전이
6. **[코드]** `main.ts` → `CameraModule` 단일 경로 통합 (EAR 임계값 3중 정의 제거)
7. **[규제]** 개인정보 수집·이용 동의서 화면 추가 (PIPA §23 바이오정보)
8. **[보안]** MediaPipe 모델 파일 SHA-384 SRI 검증

**예상 소요**: 1.5~2 영업일

---

## 🔑 핵심 불변식 (I-1 ~ I-7)

| ID | 내용 |
|----|------|
| I-1 | `VideoPipeline.start()`와 `FaceLandmarkerRunner.create()`는 `Promise.all`로 병렬 실행 가능해야 함 |
| I-2 | MediaPipe WASM + 모델은 **same-origin** 서빙 (CDN 금지) |
| I-3 | `detectForVideo` 타임스탬프는 **정수 밀리초** (`Math.floor(performance.now())`) |
| I-4 | Performance Budget 슬롯 합계 < 5000ms |
| I-5 | **스코어링한 프레임과 인코딩한 프레임은 동일** — 썸네일 기반 스코어링 + 원본 재샘플링 금지 |
| I-6 | `frame-view.ts`의 다운스케일 뷰는 `RingFrame`에 캐싱 금지 |
| I-7 | `RingBuffer` 축출 시 `ImageBitmap.close()` 즉시 호출 (GPU 텍스처 해제) |

---

## 📞 문의

본 POC는 **디지털전략부 채널기획**에서 설계·검증되었습니다. 운영 이식 과정에서 기술 질문은 기획 담당자에게 문의 바랍니다.

---

_POC 검증 완료: 2026-04-11_
