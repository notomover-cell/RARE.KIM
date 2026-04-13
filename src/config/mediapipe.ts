// MediaPipe runtime asset paths.
//
// Invariant I-2: every asset referenced here MUST be served same-origin from
// `public/vendor/mediapipe/`. No CDN URLs are allowed — `FilesetResolver` and
// `createFromOptions` receive these exact relative paths, and the JSP shell
// (Phase 7) is responsible for mirroring them to
// `/resource/js/mwp/vendor/mediapipe/…`.

export interface MediaPipeAssetPaths {
  wasmBaseUrl: string;
  modelUrl: string;
}

const WASM_DEV_BASE_URL = "/vendor/mediapipe";
const MODEL_FULL = `${WASM_DEV_BASE_URL}/face_landmarker.task`;
const MODEL_LITE = `${WASM_DEV_BASE_URL}/face_landmarker_lite.task`;

export const MEDIAPIPE_PATHS: MediaPipeAssetPaths = {
  wasmBaseUrl: WASM_DEV_BASE_URL,
  modelUrl: MODEL_FULL,
};

export function resolveMediaPipePaths(opts?: {
  baseUrl?: string;
  useLite?: boolean;
}): MediaPipeAssetPaths {
  const base = opts?.baseUrl ?? WASM_DEV_BASE_URL;
  const model = opts?.useLite
    ? `${base}/face_landmarker_lite.task`
    : `${base}/face_landmarker.task`;
  return { wasmBaseUrl: base, modelUrl: model };
}

export const MEDIAPIPE_MODEL_LITE_URL = MODEL_LITE;
