// Public API types for CameraModule (Phase 1, formalized for AC7 / Req #1).
// SessionResult and SessionError form the mutually-exclusive callback contract:
// for any session, exactly one of onComplete(SessionResult) or onError(SessionError)
// fires exactly once. The Phase 9 spec tests/unit/camera-module.callback.spec.ts
// verifies this contract end-to-end.

export type SessionErrorCode =
  | "permission_denied"      // AC11: getUserMedia rejected with NotAllowedError
  | "timeout"                // AC10: 15s session timeout after 3 retries
  | "upload_failed"          // AC6/AC10: POST /api/face-capture non-OK or network error
  | "webview_unsupported"    // AC11: navigator.mediaDevices undefined OR android_webview(<83) OR ios_wkwebview w/o inline config
  | "face_detection_failed"  // MediaPipe FaceLandmarker init/runtime failure
  | "internal";              // Unknown / unexpected exception

export interface SessionError {
  code: SessionErrorCode;
  message: string;
  cause?: unknown;
}

export type SessionResultStatus = "success" | "cancelled";

export interface ScoreBreakdown {
  sharpness: number;
  reflectionFree: number;
  alignment: number;
  total: number;
}

export interface ServerUploadResponse {
  ok: true;
  id: string;
}

export interface SessionResult {
  status: SessionResultStatus;
  uploadedAt: number;
  sessionMs: number;
  serverResponse: ServerUploadResponse;
  score: ScoreBreakdown;
}

export interface CameraModuleOptions {
  uploadUrl: string;
  videoEl?: HTMLVideoElement;
  overlayEl?: HTMLCanvasElement;
  onComplete?: (result: SessionResult) => void;
  onError?: (err: SessionError) => void;
  onStateChange?: (state: string) => void;
}

export interface UploadMeta {
  capturedAt: number;
  sessionMs: number;
  score: ScoreBreakdown;
}
