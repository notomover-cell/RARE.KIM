// Phase 6 — multipart/form-data POST /api/face-capture.
// Retries 5xx up to 2 times. Nulls the internal Blob reference on success (AC13).

import type { ServerUploadResponse, UploadMeta } from "../module/types";

export interface UploadSuccess {
  ok: true;
  id: string;
  uploadedAt: number;
}

export interface UploadFailure {
  ok: false;
  error: string;
  status?: number;
}

export type UploadResult = UploadSuccess | UploadFailure;

const MAX_5XX_RETRIES = 2;

export class Uploader {
  private readonly endpoint: string;
  private pending: Blob | null = null;

  constructor(endpoint: string) {
    this.endpoint = endpoint;
  }

  async upload(jpeg: Blob, meta: UploadMeta): Promise<UploadResult> {
    this.pending = jpeg;
    try {
      let lastStatus: number | undefined;
      let lastError = "unknown";
      for (let attempt = 0; attempt <= MAX_5XX_RETRIES; attempt++) {
        const form = new FormData();
        form.append("image", jpeg, "face.jpg");
        form.append("meta", JSON.stringify(meta));

        let response: Response;
        try {
          response = await fetch(this.endpoint, { method: "POST", body: form });
        } catch (err) {
          lastError = err instanceof Error ? err.message : String(err);
          if (attempt === MAX_5XX_RETRIES) break;
          continue;
        }

        if (response.ok) {
          const body = (await response.json()) as ServerUploadResponse & {
            uploaded_at?: string;
          };
          const uploadedAt = body.uploaded_at ? Date.parse(body.uploaded_at) : Date.now();
          return { ok: true, id: body.id, uploadedAt };
        }

        lastStatus = response.status;
        lastError = `HTTP ${response.status}`;
        // Only retry 5xx; 4xx is terminal.
        if (response.status < 500 || attempt === MAX_5XX_RETRIES) break;
      }
      return { ok: false, error: lastError, status: lastStatus };
    } finally {
      // AC13: drop the Blob reference so the bitmap-derived bytes can be GC'd.
      this.pending = null;
    }
  }
}
