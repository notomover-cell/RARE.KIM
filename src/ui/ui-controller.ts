// ui-controller.ts — Phase 7 DOM ↔ CameraModule glue.
//
// Responsibilities:
//   1. Bind the JSP shell DOM (#overlay_canvas, #help_text, #face_auto_capture,
//      #btnClose) to lifecycle hooks on CameraModule.
//   2. Draw the ellipse face guide on #overlay_canvas (intentional geometry
//      non-parity from the legacy 4-PNG rectangle bracket — Phase 7 plan).
//   3. Map FSM state names to Korean help-text strings via #help_text
//      (a Phase 8 a11y polish pass adds aria-live announcements).
//   4. Wire #face_auto_capture click → manual capture / fallback path.
//   5. Wire #btnClose click → exit.
//
// Phase 7 owns the wiring stubs; Phase 4 (FSM) and Phase 8 (manual fallback)
// supply the runtime events this controller listens to.

export type FsmState =
  | "IDLE"
  | "ALIGNING"
  | "ALIGN_HOLD"
  | "BLINK_PROMPT"
  | "BLINK_DETECTING"
  | "BLINK_CONFIRMED"
  | "CAPTURE"
  | "UPLOADING"
  | "COMPLETE"
  | "MANUAL_FALLBACK"
  | "TIMEOUT"
  | "ERROR";

export interface UIControllerOptions {
  root?: ParentNode;
  onManualCapture?: () => void;
  onExit?: () => void;
}

export interface UIControllerHandle {
  setState(state: FsmState): void;
  setHelpText(text: string): void;
  setManualMode(active: boolean): void;
  drawGuide(): void;
  destroy(): void;
}

// FSM → Korean copy (mirrors Phase 8 acceptance copy in plan).
const HELP_TEXT_BY_STATE: Record<FsmState, string> = {
  IDLE: "카메라를 준비 중입니다",
  ALIGNING: "얼굴을 화면 안에 맞춰주세요",
  ALIGN_HOLD: "그대로 유지해주세요",
  BLINK_PROMPT: "눈을 감았다 떠주세요",
  BLINK_DETECTING: "눈 깜빡임을 인식하는 중...",
  BLINK_CONFIRMED: "확인되었습니다",
  CAPTURE: "촬영 중...",
  UPLOADING: "전송 중...",
  COMPLETE: "완료",
  MANUAL_FALLBACK: "화면을 직접 탭해서 촬영할 수 있습니다",
  TIMEOUT: "시간이 초과되었습니다. 다시 시도해주세요",
  ERROR: "오류가 발생했습니다",
};

// Brand yellow (rgb(255, 242, 95)) — matches .guide_text.
const GUIDE_STROKE = "rgb(255, 242, 95)";
const CANVAS_W = 360;
const CANVAS_H = 649;
const ELLIPSE_CX = CANVAS_W / 2;
const ELLIPSE_CY = CANVAS_H / 2 - 30;
const ELLIPSE_RX = 110;
const ELLIPSE_RY = 150;

export function createUIController(opts: UIControllerOptions = {}): UIControllerHandle {
  const root: ParentNode = opts.root ?? document;

  const canvas = root.querySelector<HTMLCanvasElement>("#overlay_canvas");
  const helpText = root.querySelector<HTMLElement>("#help_text");
  const captureBtn = root.querySelector<HTMLButtonElement>("#face_auto_capture");
  const exitBtn = root.querySelector<HTMLButtonElement>("#btnClose");

  const handleCaptureClick = (ev: Event) => {
    ev.preventDefault();
    opts.onManualCapture?.();
  };
  const handleCaptureKey = (ev: KeyboardEvent) => {
    if (ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      opts.onManualCapture?.();
    }
  };
  const handleExitClick = (ev: Event) => {
    ev.preventDefault();
    opts.onExit?.();
  };
  const handleExitKey = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" || ev.key === "Enter" || ev.key === " ") {
      ev.preventDefault();
      opts.onExit?.();
    }
  };

  captureBtn?.addEventListener("click", handleCaptureClick);
  captureBtn?.addEventListener("keydown", handleCaptureKey);
  exitBtn?.addEventListener("click", handleExitClick);
  exitBtn?.addEventListener("keydown", handleExitKey);
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") opts.onExit?.();
  });

  function drawGuide(): void {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.lineWidth = 4;
    ctx.strokeStyle = GUIDE_STROKE;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.ellipse(ELLIPSE_CX, ELLIPSE_CY, ELLIPSE_RX, ELLIPSE_RY, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function setHelpText(text: string): void {
    if (!helpText) return;
    helpText.innerText = text;
  }

  function setState(state: FsmState): void {
    setHelpText(HELP_TEXT_BY_STATE[state]);
    if (state === "MANUAL_FALLBACK") {
      setManualMode(true);
    }
  }

  function setManualMode(active: boolean): void {
    if (!captureBtn) return;
    captureBtn.setAttribute("aria-pressed", active ? "true" : "false");
    captureBtn.setAttribute(
      "aria-label",
      active ? "얼굴촬영 (탭하여 촬영)" : "얼굴촬영",
    );
  }

  function destroy(): void {
    captureBtn?.removeEventListener("click", handleCaptureClick);
    captureBtn?.removeEventListener("keydown", handleCaptureKey);
    exitBtn?.removeEventListener("click", handleExitClick);
    exitBtn?.removeEventListener("keydown", handleExitKey);
  }

  drawGuide();

  return { setState, setHelpText, setManualMode, drawGuide, destroy };
}
