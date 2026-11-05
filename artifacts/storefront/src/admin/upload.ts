/**
 * Image upload helper for the admin.
 * The server re-checks everything (admin login, file type by magic bytes,
 * size limit) — these client checks only give faster, friendlier errors.
 */
import { readCsrfCookie } from "@workspace/api-client-react";

export const ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const MAX_UPLOAD_MB = 2;

export class UploadError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

export async function uploadImage(file: File): Promise<string> {
  if (!(ALLOWED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    throw new UploadError("Please choose a PNG, JPG or WebP image (SVG is not allowed).");
  }
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new UploadError(`That image is too big. The limit is ${MAX_UPLOAD_MB} MB.`);
  }
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const res = await fetch(`${base}/api/admin/uploads`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": file.type, "x-csrf-token": readCsrfCookie() },
    body: file,
  });
  const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
  if (!res.ok || !data?.url) {
    const fallback = res.status === 413 ? `That image is too big. The limit is ${MAX_UPLOAD_MB} MB.` : res.status === 401 ? "Your session expired. Please sign in again." : res.status === 403 ? "You don't have permission to upload images, or the page is out of date — reload and try again." : "Upload failed. Please try again.";
    throw new UploadError(data?.error || fallback, res.status);
  }
  return data.url;
}
