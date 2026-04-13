# 기존 신분증 촬영 페이지 분석 — MWPTBIM50000000

본 문서는 사용자가 제공한 `reference.mht` (`https://m.busanbank.co.kr/ib20/mnu/MWPTBIM50000000?preMenuId=MWPTBMAN0000020`)를 파싱해 추출한 사실만을 담습니다. 추측이 아닌 증거 기반이며, 신규 얼굴 촬영 모듈이 직접 답습/재사용할 규약과 구현 패턴을 수집합니다.

---

## 원본 메타

| 항목 | 값 |
|------|-----|
| 원본 URL | `https://m.busanbank.co.kr/ib20/mnu/MWPTBIM50000000?preMenuId=MWPTBMAN0000020` |
| 페이지 제목 | **"신분증 안내 \| 비대면실명확인 - BNK 부산은행"** |
| 진입 경로 | `MWPTBMAN0000020`(비대면업무) → `MWPTBIM50000000`(신분증 안내) |
| 저장 방식 | Chrome/Edge `Save As` → MHT (MIME multipart) |
| 파트 구성 | HTML × 1, CSS × 41, Images × 48, JS × 0 (Blink snapshot이 script 제거) |

---

## 핵심 HTML 구조 (lines 1373–1389, 그대로 인용)

```html
<div class="lybx ctg_cmn pic_idcard" style="position:absolute; top:0; overflow-y:hidden">
  <div class="scrollBox">
    <div class="video_wrapper">
      <video autoplay="" playsinline="true"></video>
    </div>
    <div class="overlay">
      <canvas id="overlay_canvas" width="360" height="649"></canvas>
      <!-- 2024-02-23 장차법 수정 / 위치 변경, button aria-label 변경, 텍스트 문구 변경 -->
      <div id="help_overlay" style="top: 172.575px;">
        <span id="help_text" class="guide_text"
              style="color: yellow; font-size: 1.5em;">
          <b>신분증을 사각 테두리에 맞춘 다음 촬영해주세요</b>
        </span>
      </div>
      <div id="button_overlay" class="button_overlay"
           style="top: 476.425px; left: 148px;">
        <button type="button" class="btn_camera"
                aria-label="신분증촬영" id="auto_snap"
                autocomplete="off" autocorrect="off"></button>
      </div>
    </div>
    <button type="button" class="btn_exit outside_btn" id="btnClose"
            autocomplete="off" autocorrect="off">나가기</button>
  </div>
</div>
```

### DOM 규약 (신규 얼굴 모듈에서 그대로 사용)
- **Wrapper**: `.lybx.ctg_cmn.<page-key>` — page-key는 `pic_idcard` → 얼굴용 `pic_face`로 교체
- **Scroll 컨테이너**: `.scrollBox`
- **비디오 레이어**: `.video_wrapper > video[autoplay playsinline]` — `controls` 없음, `playsinline`은 iOS에서 필수
- **오버레이 컨테이너**: `.overlay` (z-index 10)
- **가이드 Canvas**: `<canvas id="overlay_canvas" width="360" height="649">` — 360×649 = 부산은행 모바일웹 포트레이트 기준 좌표계
- **안내 텍스트**: `#help_overlay > #help_text.guide_text` — 동적 `top` 위치 조정
- **버튼 오버레이**: `#button_overlay.button_overlay` — 동적 `top/left` 위치 조정
- **촬영 버튼**: `<button class="btn_camera" id="auto_snap" aria-label="...">` — `autocomplete="off" autocorrect="off"` 필수. **⚠️ 사용자 확인 (2026-04-11): ID가 `auto_snap`이지만 실제 모바일웹에서는 자동촬영이 동작하지 않았고, 사용자가 버튼을 수동으로 탭해야 했음**. ID는 네이티브 앱 플로우 또는 미사용 레거시 네이밍일 가능성. 신규 얼굴 모듈은 **부산은행 모바일웹 최초의 실제 자동촬영**을 도입하는 셈.
- **나가기 버튼**: `.btn_exit.outside_btn#btnClose` — 텍스트 "나가기", 오버레이 바깥

### 접근성(장차법) 규약 — 코드 주석으로 명시
```html
<!-- 2024-02-23 장차법 수정 / 위치 변경, button aria-label 변경, 텍스트 문구 변경 -->
```
→ 버튼 `aria-label` 필수, 안내 텍스트 위치/표현 변경 이력 관리. 신규 모듈도 동일하게 **장애인차별금지법 준수**를 명시적으로 담아야 함.

---

## 카메라 전용 CSS (`002_main.css` 전문, 재사용 대상)

```css
/* 기본 컨테이너 */
video { background: none; width: 100%; height: 100%; }
div#container { max-width: 100%; }
div#unsupported_container {
  position: absolute; left: 0; top: 0; z-index: 0;
  width: 100%; height: 100%; line-height: 100%;
}

/* 레이어 스택 */
.video_wrapper  { position: absolute; left:0; top:0; z-index:0;  width:100%; height:100%; }
.overlay        { position: absolute; left:0; top:0; z-index:10; width:100%; height:100%; }

/* z-index 90 — 상태별 오버레이 슬롯 */
#progress_overlay        { z-index: 90; }  /* 진행률 */
#scan_mode_layout        { z-index: 90; }  /* 스캔 모드 선택 */
#devices_selector_layout { z-index: 90; }  /* 카메라 디바이스 선택 */
#help_overlay            { z-index: 90; }  /* 안내문 */
#center_text_overlay     { z-index: 90; }  /* 중앙 텍스트 */

/* z-index 100 — 버튼/종료 */
#btn_overlay_gui { z-index: 100; }
#wrap .btn_exit.outside_btn { position: absolute; right: 10px; z-index: 100; }

/* 안내 텍스트 */
.guide_text     { color: white; font-size: 2.5em; font-weight: bold; }
.big_guide_text { color: white; font-size: 5em;   font-weight: bold; }

/* 자동촬영 버튼 */
#auto_snap { font-weight: bold; }

/* 원형 버튼 (스캔 모드 선택 등) */
.btn-circle {
  width: 200px; height: 200px; text-align: center;
  padding: 6px 0; font-size: 2em; line-height: 1.42857;
  color: white; border-radius: 100px; margin: 100px;
}

/* 모드 스위치 (자동/수동 등 토글) */
.switch  { position: relative; display: inline-block; width: 100px; height: 60px; }
.slider  { position: absolute; cursor: pointer; inset: 0; background-color: rgb(204,204,204); transition: .4s; }
.slider::before { content: ""; position: absolute; height: 52px; width: 52px; left: 4px; bottom: 4px; background-color: white; transition: .4s; }
input:checked + .slider { background-color: rgb(33,150,243); }

.mode_text     { color: white; font-size: 2em; font-weight: bold; }
.btn_recog_mode { font-size: 1rem; padding: 1rem 2rem; }
```

### CSS에서 도출되는 "숨은 기능"
| CSS 요소 | 시사점 |
|----------|--------|
| `div#unsupported_container` | **getUserMedia 미지원 브라우저 폴백 UI**가 이미 규약에 존재 — 신규 모듈도 동일 폴백 제공 필요 |
| `#devices_selector_layout` | **다중 카메라 선택 UI** 지원 (안드로이드 멀티 후면 카메라 대응) |
| `#scan_mode_layout` / `.btn_recog_mode` | **인식 모드 전환** (auto/manual 토글) |
| `.switch` / `.slider` | 모드 토글 UI 컴포넌트 |
| `#auto_snap` | 버튼 엘리먼트만 존재하고 **실제 자동촬영 로직은 모바일웹에서 미동작** (사용자 확인). 네이밍만 남은 레거시 — 신규 모듈이 이 네이밍에 의미를 부여해 **최초로 실제 자동촬영**을 구현 |
| `#progress_overlay`, `#center_text_overlay` | 단계별 안내 UI 슬롯이 예약되어 있음 |
| `.guide_text` 기본은 white 2.5em, 페이지에서 inline으로 yellow 1.5em 오버라이드 | 페이지별 커스터마이즈 관행 확인 |

---

## 테마/공통 CSS 스택 (`mwp.css`가 단일 엔트리로 @import 체인)

40개 CSS 파일이 추출되었고, 대표 내용은 다음과 같습니다:

| 파일 | 크기 | 역할 |
|------|------|------|
| `002_main.css` | 2.8KB | **카메라 레이아웃 핵심** (위 인용) |
| `001_anim.css` | 5.7KB | CSS-only 로더 애니메이션 (`load5` keyframe, box-shadow 기반) |
| `003_bootstrap.min.css` | 156KB | Bootstrap CSS — 공통 유틸 클래스 기반 |
| `004_transkey.css` | 10KB | TransKey Mobile 보안 키보드 |
| `010_bnk_new_2023.css` | 599KB | 2023 리뉴얼 공통 디자인 시스템 (header `bnk-new-2023`) |
| `012_acc_new.css` | 83KB | **접근성 전용 스타일**(acc = accessibility) |
| `027_contents_fpm.css` | 498KB | **`.pic_idcard` 스타일 정의 포함** (FPM = 비대면 업무 영역) |
| `034_contents.css` | 884KB | 종합 컨텐츠 스타일 |
| `035_common.css` | 233KB | 공통 컴포넌트 |
| `037_layout.css` | 38KB | 레이아웃 기본 |
| `038_font.css` | 1.5KB | 웹폰트 |
| `039_reset.css` | 2.2KB | CSS reset |

### `.pic_idcard` 페이지 전용 스타일 (`027_contents_fpm.css` lines 2213–2229)

```css
.pic_idcard { position: relative; padding: 0; }
.pic_idcard::before {
  content: ""; display: block; position: absolute; inset: 0;
  background-color: rgb(0,0,0); opacity: 0.6;
}
.pic_idcard .pic_wrap {
  position: absolute; left: 0; right: 0; top: 50%;
  transform: translateY(-50%); text-align: center;
}
.pic_idcard .pic_wrap .txt {
  margin-bottom: 78px;
  font-size: 1.5rem; font-weight: 900;
  color: rgb(255, 242, 95);  /* 부산은행 브랜드 옐로우 */
  text-align: center;
}
.pic_idcard .pic_wrap .pic_area {
  margin: 0 auto;
  background:
    url("/resource/img/mwp/ico_camera_01.png") left top  / 28px 28px no-repeat,
    url("/resource/img/mwp/ico_camera_02.png") right top,
    url("/resource/img/mwp/ico_camera_03.png") left bottom,
    url("/resource/img/mwp/ico_camera_04.png") right bottom
    rgb(153,153,153);
}
.pic_idcard .pic_wrap .btn_camera {
  width: 64px; height: 64px; margin-top: 78px;
  background: url("/resource/img/mwp/btn_camera.png") 0% 0% / 64px 64px;
}
.pic_idcard .overlay .help_overlay {
  margin-bottom: 78px; font-size: 1.5rem; font-weight: 900;
  color: rgb(255, 242, 95); text-align: center;
}
.pic_idcard .overlay .button_overlay { position: absolute; }
.pic_idcard .overlay .btn_camera {
  width: 64px; height: 64px;
  background: url("/resource/img/mwp/btn_camera.png") 0% 0% / 64px 64px;
}
```

### 핵심 패턴: **가이드 브라켓 = 4개 PNG**
가이드 영역의 **4개 코너 브라켓**이 별도 PNG 4장(`ico_camera_01~04.png`)으로 구현되어, CSS `background: multi-url`로 합성됩니다. 신규 얼굴 모듈도 동일 기법을 쓰면 시각적 일관성 확보. 얼굴용은 원형/타원형 가이드가 더 적합하므로 별도 에셋 또는 Canvas drawing으로 대체 고려.

### 부산은행 브랜드 옐로우
- **`rgb(255, 242, 95)`** (= `#FFF25F`) — 가이드 텍스트 메인 색상
- 페이지 특정 인라인에선 `yellow`(= `#FFFF00`)로 단순화되기도 함

---

## 공통 인프라 스택 (HTML head에서 확인된 것)

| 솔루션 | 근거 | 본 모듈 관련성 |
|--------|------|----------------|
| **ib20 채널 프레임워크** | URL 패턴 `/ib20/mnu/MWPxxxxxxxx` + `preMenuId` 파라미터 | JSP 라우트 등록 규약 준수 필요 |
| **JSP 서버 템플릿** | 페이지 확장자/include 패턴 | 동일 |
| **jQuery** | meta viewport에 `$(window).width()` 템플릿이 노출(런타임에서 평가되는 흔적) | 공용 스크립트가 jQuery 전제 — 신규 모듈도 충돌 없이 공존 |
| **Bootstrap CSS** | `bootstrap.min.css` 로드 | 공통 유틸 클래스 재사용 |
| **TransKey Mobile** | `transkey.css` + `transkeyServlet` 이미지 | 가상키보드 — 본 모듈 직접 사용 X |
| **yUMonitor** | HTML 주석 마커 | APM/모니터링 — 본 모듈은 초기화만 방해하지 않으면 OK |
| **안랩 v3 웹** | HTML 주석 마커 | 보안 스캐너 — 본 모듈의 스크립트가 차단되지 않도록 주의 |
| **NetFunnel** | 홈 페이지에서 `NetFunnel_Action()` 사용 확인 | 대기열 — 업무 플로우 상위에서 이미 처리, 본 모듈에서 재호출 불필요 |
| **CrossWebEx** | HTML 주석 마커 | 화상상담 (비대면 업무용) — 참고만 |
| **굿뱅크 앱 WebView 호환** | "굿뱅크 앱인 경우와 모바일웹인경우 공통 스크립트 처리" 주석 | **동일 JSP가 네이티브 앱 WebView에서도 렌더링됨** → 신규 모듈도 WebView에서 동작 보장 필요 |

---

## 리소스 경로 규약

```
/resource/img/mwp/     # 모바일웹 공통 이미지 (로고, 카메라 버튼, 가이드 브라켓)
/resource/img/new/     # 2023 리뉴얼 이후 신규 아이콘
/resource/css/mwp/     # 모바일웹 CSS 번들
/resource/css/mwp/mwp.css?v=V20260410000001   # 단일 엔트리, @import 체인
/mwp/jsp/cmn/quram/    # Quram 솔루션 연동 에셋 (이미지 처리 벤더로 추정)
/product/install/transkey_mobile/   # TransKey 설치 경로
/ib20/mnu/<MenuID>     # ib20 라우트 패턴
```

**버전 관리 관행**: `?v=V20260410000001` — YYYYMMDD + 6자리 시퀀스. 캐시 무효화용.

---

## 신규 얼굴 모듈 설계에 직접 반영할 규약 (체크리스트)

- [ ] **라우트**: `MWPTBIM` 계열 신규 메뉴 ID (가칭 `MWPTBIM60000000`), `preMenuId=MWPTBMAN0000020`로 진입
- [ ] **페이지 래퍼 클래스**: `.lybx.ctg_cmn.pic_face` (기존 `.pic_idcard`와 대칭)
- [ ] **DOM 구조**: `.video_wrapper > video[autoplay playsinline]` + `.overlay > #overlay_canvas + #help_overlay + #button_overlay` + `.btn_exit.outside_btn#btnClose`
- [ ] **Canvas 기준 좌표계**: 360×649 (기존과 동일) — 실제 뷰포트는 이에 비례 스케일
- [ ] **텍스트 색상**: 부산은행 옐로우 `rgb(255,242,95)` 또는 단순 `yellow`
- [ ] **버튼 ID 유지 여부 결정**: 기존 `#auto_snap` 네이밍을 재사용할지(의미 부여하여 실제 자동촬영에 연결), 혼동 방지 위해 신규 ID(`#face_auto_capture` 등) 부여할지 — ralplan에서 결정. 기존엔 수동 탭 전용이었음.
- [ ] **aria-label 필수**: 예) `aria-label="얼굴촬영"`
- [ ] **나가기 버튼 동작**: `#btnClose` — 기존 구현 확인 후 동일 핸들러 재사용
- [ ] **공용 헤더**: `bnk-new-2023` 헤더와 간섭 없도록 z-index/포지셔닝 조정
- [ ] **폴백 UI**: `#unsupported_container` 기반 getUserMedia 미지원 안내
- [ ] **WebView 호환**: 굿뱅크 앱 WebView(iOS/Android)에서도 카메라 권한 플로우 정상 동작 확인
- [ ] **장차법 주석**: 변경 이력 주석을 코드에 남김 (기존 컨벤션)
- [ ] **리소스 버전 쿼리**: `?v=V20260410xxxxxx` 패턴 적용
- [ ] **jQuery 공존**: 공용 스크립트가 jQuery를 로드 → 신규 모듈은 jQuery 의존 없이 작성해도 무방하나, `$` 심볼 충돌 회피

---

## 남은 불확실성 (ralplan 단계에서 해소 필요)

1. **실제 `auto_snap` 버튼의 기존 JS 바인딩 로직** — MHT에 script가 없어 확인 불가. 기존 구현이 자동촬영을 언제 트리거하는지(안정성/선명도/얼굴검출 등) 내부 저장소 확인 필요
2. **기존 getUserMedia 에러 처리 플로우의 정확한 이동 경로** — 권한 거부 시 어느 URL로 리다이렉트하는지
3. **이미지 업로드 실 엔드포인트** — 기존 신분증 촬영의 upload URL/스키마
4. **공용 JS 번들** — `mwp.js` 같은 공용 번들이 jQuery, 공통 alert, AJAX helper를 어떻게 제공하는지 (신규 모듈이 이를 쓸지 판단)
5. **Quram 솔루션의 역할** — 이미지 처리(OCR? 진위확인?) 벤더로 추정되지만 실체 확인 필요

→ 이 5개 항목은 **ralplan Architect/Critic 단계에서 사내 저장소 접근이 가능한 시점**에 해소합니다. POC 구현은 합리적 기본값으로 진행.
