// Phase 3 — MediaPipe FaceLandmarker wrapper.
//
// Owns the `@mediapipe/tasks-vision` FaceLandmarker instance for the session.
// Loads WASM + the `face_landmarker.task` model strictly from same-origin
// `public/vendor/mediapipe/` (Invariant I-2). Per-frame `detect()` returns
// normalized landmarks, derived head pose (yaw/pitch/roll in degrees) and EAR
// on the combined left+right eye. `FaceLandmarkerRunner.create()` is
// designed to be called in parallel with `VideoPipeline.start()` from
// `CameraModule.start()` via `Promise.all` (Invariant I-1).

import {
  FaceLandmarker,
  FilesetResolver,
  type FaceLandmarkerResult,
  type NormalizedLandmark,
} from "@mediapipe/tasks-vision";

import { resolveMediaPipePaths } from "../config/mediapipe";
import { computeEAR } from "./metrics/ear";

export interface FrameMetrics {
  timestamp: number;
  landmarks: NormalizedLandmark[] | null;
  headPose: { yaw: number; pitch: number; roll: number } | null;
  ear: number | null;
  faceBox: { x: number; y: number; w: number; h: number } | null;
}

export interface FaceLandmarkerRunnerOptions {
  wasmBaseUrl?: string;
  modelUrl?: string;
  useLite?: boolean;
  numFaces?: number;
  minFaceDetectionConfidence?: number;
  delegate?: "GPU" | "CPU";
}

export class FaceLandmarkerRunner {
  private landmarker: FaceLandmarker;
  private closed = false;

  private constructor(landmarker: FaceLandmarker) {
    this.landmarker = landmarker;
  }

  static async create(
    opts: FaceLandmarkerRunnerOptions = {},
  ): Promise<FaceLandmarkerRunner> {
    const paths = resolveMediaPipePaths({
      baseUrl: opts.wasmBaseUrl,
      useLite: opts.useLite,
    });
    const modelUrl = opts.modelUrl ?? paths.modelUrl;
    const fileset = await FilesetResolver.forVisionTasks(paths.wasmBaseUrl);

    const buildLandmarker = async (
      delegate: "GPU" | "CPU",
    ): Promise<FaceLandmarker> =>
      FaceLandmarker.createFromOptions(fileset, {
        baseOptions: {
          modelAssetPath: modelUrl,
          delegate,
        },
        runningMode: "VIDEO",
        numFaces: opts.numFaces ?? 1,
        minFaceDetectionConfidence: opts.minFaceDetectionConfidence ?? 0.3,
        outputFaceBlendshapes: false,
        outputFacialTransformationMatrixes: true,
      });

    const requested = opts.delegate ?? "GPU";
    try {
      const landmarker = await buildLandmarker(requested);
      return new FaceLandmarkerRunner(landmarker);
    } catch (err) {
      if (requested === "GPU") {
        // Older Android WebViews + some Chromium forks cannot spin up a
        // WebGL2 delegate. Fall back to CPU so detection still works.
        // eslint-disable-next-line no-console
        console.warn(
          "[FaceLandmarkerRunner] GPU delegate failed, retrying on CPU",
          err,
        );
        const landmarker = await buildLandmarker("CPU");
        const runner = new FaceLandmarkerRunner(landmarker);
        runner.usingCpuFallback = true;
        return runner;
      }
      throw err;
    }
  }

  usingCpuFallback = false;

  detect(video: HTMLVideoElement, timestamp: number): FrameMetrics {
    if (this.closed) {
      return this.emptyFrame(timestamp);
    }
    let result: FaceLandmarkerResult | null = null;
    try {
      result = this.landmarker.detectForVideo(video, timestamp);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("[FaceLandmarkerRunner] detect throw", err);
      return this.emptyFrame(timestamp);
    }

    const landmarks = result?.faceLandmarks?.[0] ?? null;
    if (!landmarks || landmarks.length === 0) {
      return this.emptyFrame(timestamp);
    }

    const matrix = result?.facialTransformationMatrixes?.[0]?.data ?? null;
    const headPose = matrix ? headPoseFromMatrix(matrix) : null;
    const ear = computeEAR(landmarks);
    const faceBox = computeFaceBox(landmarks);

    return {
      timestamp,
      landmarks,
      headPose,
      ear,
      faceBox,
    };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    try {
      this.landmarker.close();
    } catch {
      // ignore
    }
  }

  private emptyFrame(timestamp: number): FrameMetrics {
    return {
      timestamp,
      landmarks: null,
      headPose: null,
      ear: null,
      faceBox: null,
    };
  }
}

// Head pose (yaw / pitch / roll in degrees) from a column-major 4x4 rotation
// matrix supplied by MediaPipe's `facialTransformationMatrixes`. The matrix
// uses OpenGL conventions so the rotation portion lives in the top-left 3x3:
// R = [m0 m4 m8; m1 m5 m9; m2 m6 m10].
function headPoseFromMatrix(m: readonly number[]): {
  yaw: number;
  pitch: number;
  roll: number;
} | null {
  if (m.length < 16) return null;
  const r00 = m[0];
  const r10 = m[1];
  const r20 = m[2];
  const r21 = m[6];
  const r22 = m[10];

  const toDeg = 180 / Math.PI;
  const pitch = Math.atan2(-r20, Math.sqrt(r21 * r21 + r22 * r22)) * toDeg;
  const yaw = Math.atan2(r10, r00) * toDeg;
  const roll = Math.atan2(r21, r22) * toDeg;
  return { yaw, pitch, roll };
}

function computeFaceBox(landmarks: NormalizedLandmark[]): {
  x: number;
  y: number;
  w: number;
  h: number;
} | null {
  if (landmarks.length === 0) return null;
  let minX = 1;
  let minY = 1;
  let maxX = 0;
  let maxY = 0;
  for (const lm of landmarks) {
    if (lm.x < minX) minX = lm.x;
    if (lm.y < minY) minY = lm.y;
    if (lm.x > maxX) maxX = lm.x;
    if (lm.y > maxY) maxY = lm.y;
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
