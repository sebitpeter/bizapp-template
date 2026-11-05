import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, mediaTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { env } from "../lib/env";

/**
 * Image uploads (hand-written, not in openapi.yaml because the body is raw bytes).
 *
 *   POST /api/admin/uploads   (managers and owners)  body = the image bytes,
 *                              Content-Type: image/png | image/jpeg | image/webp
 *   GET  /api/media/:id        public, serves the stored image
 *
 * Safety rules:
 *  - only PNG / JPEG / WebP; SVG is refused (it can contain scripts)
 *  - the file's first bytes ("magic bytes") must match a real image, whatever
 *    the Content-Type header claims
 *  - size limit (UPLOAD_MAX_MB, default 2 MB)
 *  - the server picks a random file name; the client's name is never used, so
 *    path traversal ("../../etc/passwd") is impossible
 *  - served with the right Content-Type, nosniff and a locked-down CSP
 */
const router: IRouter = Router();

const ALLOWED = ["image/png", "image/jpeg", "image/webp"] as const;
type Kind = { contentType: (typeof ALLOWED)[number]; ext: "png" | "jpg" | "webp" };

export function sniffImage(buf: Buffer): Kind | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { contentType: "image/png", ext: "png" };
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg" };
  }
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    return { contentType: "image/webp", ext: "webp" };
  }
  return null;
}

const MEDIA_ID = /^[a-f0-9]{32}\.(png|jpg|webp)$/;
const TYPE_BY_EXT: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

const rawImage = express.raw({ type: [...ALLOWED], limit: env.uploadMaxBytes });

router.post("/admin/uploads", requireAuth("uploads.create"), (req, res, next) => {
  const type = (req.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!(ALLOWED as readonly string[]).includes(type)) {
    res.status(415).json({ error: "Only PNG, JPEG or WebP images are allowed (SVG is not accepted)" });
    return;
  }
  next();
}, rawImage, async (req, res): Promise<void> => {
  const body = req.body;
  if (!Buffer.isBuffer(body) || body.length === 0) {
    res.status(400).json({ error: "Empty upload" });
    return;
  }
  const kind = sniffImage(body);
  if (!kind) {
    res.status(415).json({ error: "This file is not a real PNG, JPEG or WebP image" });
    return;
  }
  const id = `${crypto.randomBytes(16).toString("hex")}.${kind.ext}`;

  if (env.uploadStorage === "disk") {
    await fs.mkdir(env.uploadDir, { recursive: true });
    await fs.writeFile(path.join(env.uploadDir, id), body, { flag: "wx" });
    await db.insert(mediaTable).values({ id, contentType: kind.contentType, size: body.length, data: null });
  } else {
    await db.insert(mediaTable).values({ id, contentType: kind.contentType, size: body.length, data: body });
  }

  await audit(req, "upload.create", "media", id, { size: body.length });
  res.status(201).json({ id, url: `/api/media/${id}`, contentType: kind.contentType, size: body.length });
});

router.get("/media/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id ?? "");
  if (!MEDIA_ID.test(id)) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  const [row] = await db.select().from(mediaTable).where(eq(mediaTable.id, id));
  let data: Buffer | null = row?.data ?? null;
  if (row && !data) {
    const file = path.resolve(env.uploadDir, id);
    if (path.dirname(file) !== env.uploadDir) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    data = await fs.readFile(file).catch(() => null);
  }
  if (!row || !data) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  res.set({
    "Content-Type": TYPE_BY_EXT[id.split(".")[1]] ?? row.contentType,
    "Content-Length": String(data.length),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "public, max-age=31536000, immutable",
    "Content-Disposition": `inline; filename="${id}"`,
  });
  res.end(data);
});

export default router;
