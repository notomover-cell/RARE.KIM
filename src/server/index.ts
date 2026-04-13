// Phase 6 — Express mock server for POST /api/face-capture (POC only).
// Stores uploaded JPEGs + meta JSON under tmp/uploads/. CORS enabled for POC.

import express, { type Request, type Response } from "express";
import multer from "multer";
import cors from "cors";
import { existsSync, mkdirSync, writeFileSync } from "fs";
import { resolve } from "path";
import { randomUUID } from "crypto";

const UPLOAD_DIR = resolve(process.cwd(), "tmp/uploads");
mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 4 },
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === "image/jpeg");
  },
});
const app = express();

app.use(cors({ origin: ["http://localhost:5173", "https://localhost:5173"] }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ ok: true, service: "mw-camera-mock", now: new Date().toISOString() });
});

// Serve the uploaded JPEG back so the client can display what it sent.
app.get("/api/face-capture/:id", (req: Request, res: Response) => {
  const id = req.params.id;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    res.status(400).json({ ok: false, error: "bad id" });
    return;
  }
  const jpgPath = resolve(UPLOAD_DIR, `${id}.jpg`);
  if (!existsSync(jpgPath)) {
    res.status(404).json({ ok: false, error: "not found" });
    return;
  }
  res.sendFile(jpgPath);
});

app.post(
  "/api/face-capture",
  upload.single("image"),
  (req: Request, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ ok: false, error: "missing image field" });
      return;
    }

    const id = randomUUID();
    const jpgPath = resolve(UPLOAD_DIR, `${id}.jpg`);
    const metaPath = resolve(UPLOAD_DIR, `${id}.json`);

    writeFileSync(jpgPath, file.buffer);
    const rawMeta = typeof req.body?.meta === "string" ? req.body.meta : "{}";
    let parsedMeta: unknown;
    try {
      parsedMeta = JSON.parse(rawMeta);
    } catch {
      parsedMeta = { raw: rawMeta, parseError: true };
    }
    const metaRecord = {
      id,
      uploadedAt: new Date().toISOString(),
      size: file.size,
      mimetype: file.mimetype,
      meta: parsedMeta,
    };
    writeFileSync(metaPath, JSON.stringify(metaRecord, null, 2));

    res.status(200).json({
      ok: true,
      id,
      size: file.size,
      uploaded_at: metaRecord.uploadedAt,
    });
  },
);

const PORT = Number(process.env.PORT ?? 3001);
if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`[mw-camera-mock] listening on http://localhost:${PORT}`);
    console.log(`[mw-camera-mock] uploads → ${UPLOAD_DIR}`);
  });
}

export { app };
