# Deep Interview Spec: 부산은행 모바일웹 액티브 라이브니스 카메라 모듈

## Metadata
- Interview ID: mw-camera-001
- Rounds: 5 (+ post-interview evidence harvest)
- Final Ambiguity Score: **9.5%** (refined from 17.5% after MHT reference analysis)
- Threshold: 20% (PASSED)
- Type: Greenfield (integrates with existing brownfield ib20 channel)
- Generated: 2026-04-11
- Status: PASSED
- Reference Assets: `reference/existing-id-capture/` (user-provided MHT of `MWPTBIM50000000`)
- Reference Analysis: `reference/existing-id-capture/ANALYSIS.md`

## Clarity Breakdown
| Dimension | Score | Weight | Weighted |
|-----------|-------|--------|----------|
| Goal Clarity | 0.95 | 0.40 | 0.380 |
| Constraint Clarity | 0.90 | 0.30 | 0.270 |
| Success Criteria | 0.85 | 0.30 | 0.255 |
| **Total Clarity** | | | **0.905** |
| **Ambiguity** | | | **0.095 (9.5%)** |

**Refinement source**: 사용자 제공 MHT(`MWPTBIM50000000` 전체 리소스 스냅샷)를 파싱해 40+ CSS 파일, 48 이미지, HTML 구조를 추출. 기존 페이지의 DOM 스켈레톤, CSS 레이어 규약, z-index 체계, `#devices_selector_layout`/`#unsupported_container`/`#auto_snap` 엘리먼트 존재를 증거로 확인 → 추정이 증거로 승급되어 Constraints/Criteria 클래리티가 각각 +0.15, +0.05 상승.

**User correction (2026-04-11)**: `#auto_snap` ID는 존재했으나 **모바일웹에서는 실제 자동촬영 동작이 없었고 사용자가 수동으로 버튼을 탭해야 했다**. 따라서 신규 얼굴 모듈은 **부산은행 모바일웹 역사상 최초의 실제 자동촬영 구현**이 되며, 이는 비교 대상이 될 기존 모바일웹 베이스라인이 없다는 뜻이기도 함 → 수락 기준은 내부 테스트 기반으로 설정.

---

## Goal

부산은행 모바일웹(`m.busanbank.co.kr`)의 비대면실명확인 플로우에 투입될 **얼굴 촬영 전용 라우트 페이지**를 구현한다. 사용자는 페이지 진입 시 카메라를 통해 **정면 정렬 → 눈 깜빡임**의 2단계 고정 액티브 라이브니스 시퀀스를 수행하며, 클라이언트가 액션 완료를 감지하는 순간 전후의 링버퍼에서 **선명도 + 빛반사 없음 + 얼굴 정렬도** 3축 가중합 스코어가 가장 높은 단일 프레임을 자동 선택해 서버로 JPEG 1장을 업로드한다. 서버단 얼굴 검증·신분증 대조는 외부 솔루션이 처리하므로 범위 밖이며, 본 모듈의 책임은 **서버에 전달되는 단일 이미지의 품질을 극대화하는 것**이다.

### 기존 시스템과의 관계 (from evidence)
- **기존 ID 촬영 페이지**: `https://m.busanbank.co.kr/ib20/mnu/MWPTBIM50000000?preMenuId=MWPTBMAN0000020`
  - 메뉴 ID: `MWPTBIM50000000` (신분증 촬영, 수동 셔터)
  - UX: BNK 헤더 + "나가기" 버튼 / 풀스크린 카메라 / 상단 안내문구 / 노란 코너 브라켓 가이드 / 하단 셔터
  - 스택: ib20 JSP + Vanilla JavaScript, getUserMedia 기반
- **신규 얼굴 촬영 페이지**: `MWPTBIM50000000`의 쌍둥이 구조를 따라 **얼굴용**으로 신규 추가 (가칭 `MWPTBIM60000000` 계열)
- **공용 규약**: BNK 헤더, 나가기 동작, 에러 리다이렉트(`MWPCMNERR000001`), 카메라 권한 요청 플로우 모두 기존 ID 촬영 페이지와 동일하게 따름

---

## Constraints

1. **프론트엔드 스택**: 부산은행 모바일웹은 **ib20 채널 프레임워크 + JSP 서버 템플릿 + Vanilla JavaScript** (React/Vue/Angular 미사용). 카메라 모듈은 이 스택에서 동작해야 한다.
2. **납품 형태**: ib20 채널 규약에 등록 가능한 **단일 JSP 라우트 페이지**. JS/CSS는 독립 번들(IIFE/UMD) 또는 정적 파일로 제공되며, 외부 의존성은 최소화한다.
3. **카메라 API**: 브라우저 `navigator.mediaDevices.getUserMedia` (전면 카메라 facingMode:"user"). iOS Safari 및 Android Chrome 모두 지원.
4. **얼굴 검출 라이브러리**: **MediaPipe Tasks Vision – FaceLandmarker** (WebAssembly, 기기 온디바이스 실행). EAR(Eye Aspect Ratio)와 헤드 포즈(yaw/pitch/roll) 기반 액션 검증.
5. **링버퍼**: 직전 N프레임(예: 20프레임 ≈ 600~800ms)의 RGBA 비트맵 및 MediaPipe 메트릭을 메모리에 유지한다. 링버퍼는 메모리 경제를 위해 축소 해상도 + 메트릭만 저장하고, 최종 선택 프레임만 원본 해상도 JPEG로 인코딩한다.
6. **서버 업로드 payload**: **JPEG 이미지 1장** (base64 또는 multipart/form-data). 기존 신분증 촬영 페이지 payload 패턴과 동일 계열로 맞춘다. 클라이언트는 meta(촬영 시각, 액션 결과, 스코어)를 부수 필드로 함께 전송할 수 있다.
7. **브라우저 타겟 (기본값)**: iOS Safari 15+, Android Chrome 최신 2개 메이저 버전. 구형 WebView(Android 7 이하)는 우선순위 밖.
8. **HTTPS 필수**: getUserMedia는 보안 컨텍스트에서만 동작. 운영 도메인은 이미 HTTPS.
9. **트래픽 제어**: 기존 NetFunnel 호출 패턴은 비대면실명확인 업무 플로우에 이미 적용되어 있으므로 본 모듈 자체에서는 별도로 호출하지 않는다.
10. **개인정보**: 촬영된 얼굴 이미지 원본은 메모리상에서만 다루며 LocalStorage/IndexedDB에 **저장하지 않는다**. 업로드 직후 참조 해제.

---

## Differentiation from Existing Module
신규 얼굴 촬영 모듈은 기존 `MWPTBIM50000000`(신분증 촬영)의 UX 뼈대(DOM/CSS 클래스/나가기 버튼/가이드 오버레이 슬롯)를 답습하되, **동작 측면에서는 부산은행 모바일웹 최초로 다음을 도입**한다:

1. **자동촬영(Auto-capture)** — 기존 모바일웹은 ID가 `auto_snap`인 버튼만 존재할 뿐 실제로는 사용자의 수동 탭이 필요했다. 신규 모듈은 조건 충족 시 프로그래매틱하게 캡처를 트리거한다.
2. **액티브 라이브니스(Active Liveness)** — 기존 모듈은 단순 정적 촬영이다. 신규 모듈은 "정면 정렬 → 눈 깜빡임" 시퀀스를 검증한다.
3. **다프레임 베스트컷 스코어링** — 기존 모듈은 탭 순간 단일 프레임을 그대로 캡처했다. 신규 모듈은 링버퍼에서 3축(선명도 × 빛반사 × 정렬도) 가중합 최고점 프레임을 선택한다.
4. **MediaPipe 온디바이스 얼굴 랜드마크** — 기존 모듈에는 없던 얼굴 검출/포즈 추정을 도입한다.

기존 모듈의 **시각적 톤**(부산은행 옐로우 `rgb(255,242,95)`, 가이드 브라켓, 상단 안내/하단 버튼 배치, 풀스크린 비디오 + 어두운 오버레이)은 그대로 답습하여 사용자 학습 비용을 0에 수렴시킨다.

## Non-Goals

- **서버단 얼굴 검증 / 라이브니스 판정 / 신분증 대조**: 외부 전문 솔루션이 처리 (명시적 범위 밖)
- **신분증 OCR / 진위 확인**: 기존 `MWPTBIM50000000`이 담당, 본 모듈은 얼굴만
- **비대면실명확인 전체 플로우 구현**: 본 모듈은 플로우의 한 스텝으로만 존재
- **네이티브 앱 카메라 API**: 모바일 브라우저만 대상 (BNK 모바일뱅킹 앱의 WebView 호환은 부가 고려사항)
- **실시간 얼굴 매칭 / 검색**: 클라이언트는 액션 감지·베스트컷 선택만 수행
- **영상 저장 / 다운로드 / 재촬영 히스토리**: 메모리 휘발만

---

## Acceptance Criteria

### 기능 요건
- [ ] AC1. iOS Safari 15+ 및 Android Chrome 최신 버전에서 카메라 권한 요청 → 프리뷰 → 세션 완료까지 정상 동작한다.
- [ ] AC2. 페이지 진입 시 BNK 헤더와 "나가기" 버튼이 기존 `MWPTBIM50000000` UX와 동일한 위치·동작으로 렌더링된다.
- [ ] AC3. 얼굴이 프리뷰 가이드 프레임 안에 정면으로 정렬(yaw/pitch/roll 각 임계값 이내)되고 1초 이상 안정되면 "눈을 감았다 떠주세요" 안내가 표시된다.
- [ ] AC4. 눈 깜빡임은 MediaPipe FaceLandmarker의 눈 랜드마크에서 계산한 EAR이 한 번 임계 이하로 떨어졌다가 회복하는 패턴으로 감지된다.
- [ ] AC5. 링버퍼(깜빡임 감지 순간 ±N프레임)에서 **선명도(라플라시안 분산) × w1 + 빛반사 미검출 × w2 + 얼굴 정렬도 × w3** 가중합 최고점 프레임이 자동 선택된다.
- [ ] AC6. 선택된 프레임은 원본 해상도 JPEG로 인코딩되어 설정된 업로드 엔드포인트로 전송된다(모의 엔드포인트도 허용).
- [ ] AC7. 업로드 성공 시 부모 플로우가 기대하는 방식(예: 세션/쿼리 파라미터, 콜백)으로 결과가 반환된다.

### 품질 요건
- [ ] AC8. 정상 시나리오(정면 얼굴 + 정상 조명 + 눈깜빡)에서 세션 완료 평균 소요 시간 5초 이내.
- [ ] AC9. 빛반사가 감지되는 프레임은 선택되지 않는다(테스트: 의도적 고휘도 패치 주입 시 해당 프레임 배제 검증).
- [ ] AC10. 액션 미완료 또는 타임아웃(15초 기본값) 시 재시도 UI가 표시되며, 재시도 카운트 초과 시 실패 페이지로 이동한다.
- [ ] AC11. 카메라 권한 거부 시 안내 메시지와 함께 이전 페이지로 복귀 가능하다.
- [ ] AC12. 페이지 언로드 시 MediaStream track이 전부 stop()되어 카메라 LED/권한이 해제된다.
- [ ] AC13. 촬영 이미지는 LocalStorage/IndexedDB에 저장되지 않으며, 업로드 후 메모리에서 해제된다.

### 수락 테스트 (Verification Evidence)
- [ ] AC14. POC 단계에서 모의 서버(Node/Express stub)가 업로드를 수신하고 메타데이터와 함께 JPEG를 디스크에 저장·검사 가능하다.
- [ ] AC15. Chrome DevTools device emulation으로 iPhone/Galaxy 프로파일에서 수동 리그레션 시나리오 통과.

---

## Assumptions Exposed & Resolved

| Assumption | Challenge | Resolution |
|------------|-----------|------------|
| "카메라 모듈"은 임베디드 SDK일 것이다 | Round 1: 독립 라우트 페이지 / SDK / iframe / SPA 중 택일 | **독립 라우트 페이지** 확정 |
| 스택은 React 또는 Vue일 것이다 | Round 2: 실제 `m.busanbank.co.kr` 직접 조회 | **JSP + Vanilla JS (ib20 채널)** 증거 기반 확정 |
| 기존 카메라 UX가 전무하다 | Round 2: 사용자 스크린샷으로 `MWPTBIM50000000` 발견 | **기존 UX 템플릿 확보**, 신규 모듈은 쌍둥이 구조로 설계 |
| 서버로 영상이나 다수 프레임을 보낼 것이다 | Round 3: 단일 베스트컷 / 페어 / 동영상 중 택일 | **단일 JPEG 1장** 확정, 액션 검증은 클라이언트 책임 |
| 액션이 많을수록 안전하다 | Round 4 Contrarian: 액션 多 → 고령자 이탈 ↑ | **2단계 고정 시퀀스(정면→눈깜빡)** — 보안/접근성 균형 |
| 베스트컷 = 가장 선명한 프레임 | Round 5: 원청 "빛반사 없음" 명시 | **선명도 + 빛반사 제거 + 얼굴 정렬도** 가중합으로 확장 |

### 인터뷰에서 확정되지 않아 Spec 기본값으로 고정 (ralplan 단계에서 재검토 가능)
| 항목 | 기본값 |
|------|--------|
| 스코프 | **POC (기술검증) 수준**의 구현물. 실제 ib20 공용 헤더 JSP는 모의 정적 HTML로 대체하고, 핵심 카메라/라이브니스 로직은 운영 이식 가능 품질로 작성 |
| 브라우저 타겟 | iOS Safari 15+, Android Chrome 최신 2개 메이저 |
| 업로드 엔드포인트 | POC용 Node/Express stub 서버 (`POST /api/face-capture`) |
| 액션 타임아웃 | 15초, 재시도 3회 |
| 가중치 w1:w2:w3 | 0.4 : 0.3 : 0.3 (ralplan에서 실측값으로 튜닝) |
| 링버퍼 크기 | 20프레임 |

---

## Technical Context

### 핵심 기술 스택
| 영역 | 선택 | 근거 |
|------|------|------|
| 프론트 프레임워크 | **Vanilla JS (ES2020+) + TypeScript** | ib20/JSP 스택 호환, 운영 이식 용이 |
| 얼굴 검출 | **MediaPipe Tasks Vision – FaceLandmarker** (WebAssembly) | 478 landmarks, 온디바이스, iOS/Android 동시 지원 |
| 빌드 도구 | **Vite + TypeScript** (개발), **esbuild IIFE 번들** (납품) | 운영 서버에 정적 파일만 업로드 가능 |
| 스코어링 | 순수 Canvas2D + 수동 라플라시안 분산 + 휘도 히스토그램 | OpenCV.js 대비 경량화 |
| Mock 서버 | **Node.js + Express + TypeScript** | POC 업로드 수신·저장·검증용 |
| 테스트 | Vitest (unit), Playwright (브라우저 e2e 시뮬레이션) | |

### 아키텍처 초안
```
┌─────────────────────────────────────────────────┐
│  JSP Shell (MWPTBIM6xxx): BNK 헤더 + 컨테이너   │
│  ┌───────────────────────────────────────────┐  │
│  │  <script> camera-module.iife.js </script> │  │
│  │  CameraModule.start({ uploadUrl, ... })   │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│  CameraModule (TypeScript)                      │
│  ├─ VideoPipeline (getUserMedia + MediaStream)  │
│  ├─ FaceLandmarkerRunner (MediaPipe)            │
│  ├─ ActionStateMachine (정렬 → 깜빡임)           │
│  ├─ RingBuffer (last N frames + metrics)        │
│  ├─ BestCutScorer (선명도/빛반사/정렬도)        │
│  ├─ Uploader (multipart JPEG)                   │
│  └─ UI Layer (가이드 오버레이 + 안내 + 재시도)  │
└─────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────┐
│  Mock Server (Express)                          │
│  POST /api/face-capture → 저장 + 200 OK         │
└─────────────────────────────────────────────────┘
```

---

## Ontology (Key Entities)

| Entity | Type | Fields | Relationships |
|--------|------|--------|---------------|
| CameraRoutePage | core domain | route, menuId(MWPTBIM6xxx), shell(JSP) | embeds CameraModule |
| User | core domain | frontFace, eyeState | performs LivenessAction |
| BestCutImage | core domain | jpegBlob, score, capturedAt | selected by BestCutScorer |
| UploadPayload | core domain | image(JPEG), metadata | sent to UploadEndpoint |
| LivenessAction | core domain | type(front-align\|blink), state, timestamp | verified by ActionStateMachine |
| GuideOverlay | supporting | guideBox, instructionText | rendered in UI Layer |
| BnkHeader | supporting | logo, exitButton | follows `MWPTBIM50000000` pattern |
| FaceLandmarks | supporting | 478 points, headPose, EAR | produced by MediaPipe |
| BlinkEvent | supporting | startFrame, endFrame, EAR curve | triggers BestCutScorer |
| UploadEndpoint | external system | url, method, authHeader | accepts UploadPayload |
| ExistingIdCardCapture | external system | MWPTBIM50000000 | UX/stack reference |

## Ontology Convergence

| Round | Entity Count | New | Changed | Stable | Stability Ratio |
|-------|--------------|-----|---------|--------|----------------|
| 1 | 5 | 5 | - | - | N/A |
| 2 | 8 | 3 | 0 | 5 | 62.5% |
| 3 | 8 | 0 | 1 (UploadPayload 구체화) | 7 | 100% |
| 4 | 10 | 2 | 0 | 8 | 80% |
| 5 | 10 | 0 | 0 | 10 | **100%** (수렴) |

---

## Interview Transcript

<details>
<summary>Full Q&A (5 rounds)</summary>

### Round 1 — Goal Clarity
**Q:** 이 카메라 모듈의 최종 납품 형태는 무엇입니까? (임베디드 SDK / 독립 라우트 페이지 / iframe 위젯 / 독립 SPA)
**A:** 독립 라우트 페이지
**Ambiguity:** 70.5% (Goal: 0.55, Constraints: 0.15, Criteria: 0.10)

### Round 2 — Constraint Clarity (evidence-based)
**Q:** 기존 부산은행 모바일웹 프론트 스택은? → 사용자 제안으로 `m.busanbank.co.kr` 직접 조회 → ib20/JSP/Vanilla JS 판정 → 사용자 스크린샷으로 `MWPTBIM50000000` 신분증 촬영 페이지 실체 확인
**A:** 증거 제시로 확정 + 기존 UX 템플릿 확보
**Ambiguity:** 52.5% (Goal: 0.70, Constraints: 0.55, Criteria: 0.10)

### Round 3 — Success Criteria (upload payload)
**Q:** 서버로 전송되는 데이터 형태? (단일 이미지 / 페어 / 동영상 / 모름)
**A:** 단일 베스트컷 이미지 1장 (Recommended)
**Ambiguity:** 41.5% (Goal: 0.75, Constraints: 0.60, Criteria: 0.35)

### Round 4 — Success Criteria (action set, Contrarian mode)
**Q:** 액티브 라이브니스 액션 세트는? Contrarian 각도: 액션 多 → 고령자 이탈 ↑
**A:** 2개 고정 시퀀스: 정면 → 눈깜빡
**Ambiguity:** 28.5% (Goal: 0.85, Constraints: 0.70, Criteria: 0.55)

### Round 5 — Success Criteria (best-cut definition)
**Q:** 베스트컷 선택 기준? (선명도만 / 선명도+빛반사 / 선명도+빛반사+얼굴정렬도)
**A:** 선명도 + 빛반사 + 얼굴 정렬도 (Recommended)
**Ambiguity:** **17.5%** (Goal: 0.90, Constraints: 0.75, Criteria: 0.80) — **Threshold 도달**

</details>

---

## Challenge Modes Used
- [x] Round 4: **Contrarian** — 액션 多 = 안전 가정을 공격 → 접근성 장벽 제기로 단순화 유도

---

## Next Steps — Execution Bridge

이 spec는 3-stage pipeline의 Stage 1 출력입니다. Stage 2(ralplan consensus: Planner/Architect/Critic), Stage 3(autopilot execution)로 이어집니다.
