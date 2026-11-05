import fs from "node:fs/promises";
import path from "node:path";
import { eq, sql } from "drizzle-orm";
import { contentTable, db, mediaTable, productsTable, siteSettingsTable } from "@workspace/db";
import { env } from "./env";
import { logger } from "./logger";

const MEDIA_RE = /\/api\/media\/([a-f0-9]{32}\.(?:png|jpg|webp))/g;

/** All uploaded-image ids mentioned anywhere inside a value (string / object / array). */
export function mediaIdsIn(value: unknown): string[] {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return [...new Set([...text.matchAll(MEDIA_RE)].map((m) => m[1]))];
}

async function isReferenced(id: string): Promise<boolean> {
  const like = `%/api/media/${id}%`;
  const [p] = await db.select({ n: sql<number>`1` }).from(productsTable).where(sql`${productsTable.imageUrl} LIKE ${like}`).limit(1);
  if (p) return true;
  const [s] = await db.select({ n: sql<number>`1` }).from(siteSettingsTable).where(sql`${siteSettingsTable.data}::text LIKE ${like}`).limit(1);
  if (s) return true;
  const [c] = await db.select({ n: sql<number>`1` }).from(contentTable).where(sql`${contentTable.value} LIKE ${like}`).limit(1);
  return Boolean(c);
}

/**
 * Deletes uploads that were replaced and are no longer used anywhere
 * (old logo, old product photo...). Never throws: a failed cleanup must not
 * break the save that triggered it.
 */
export async function cleanupMedia(candidates: string[]): Promise<number> {
  let removed = 0;
  for (const id of new Set(candidates)) {
    try {
      if (await isReferenced(id)) continue;
      const [row] = await db.delete(mediaTable).where(eq(mediaTable.id, id)).returning({ id: mediaTable.id, data: mediaTable.data });
      if (!row) continue;
      if (!row.data) {
        const file = path.resolve(env.uploadDir, id);
        if (path.dirname(file) === env.uploadDir) await fs.rm(file, { force: true });
      }
      removed++;
    } catch (err) {
      logger.warn({ err: (err as Error).message, id }, "Media cleanup failed");
    }
  }
  if (removed) logger.info({ removed }, "Deleted unused uploads");
  return removed;
}

/** Images that were in `before` but not in `after`. */
export const replacedMedia = (before: unknown, after: unknown) => {
  const keep = new Set(mediaIdsIn(after));
  return mediaIdsIn(before).filter((id) => !keep.has(id));
};
