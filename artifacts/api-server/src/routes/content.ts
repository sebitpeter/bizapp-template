import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { contentTable, db } from "@workspace/db";
import { UpdateContentBody, UpdateContentParams } from "@workspace/api-zod";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { cleanupMedia, replacedMedia } from "../lib/media";
import { badRequest } from "../lib/http";

const router: IRouter = Router();

router.get("/content", async (_req, res): Promise<void> => {
  res.json(await db.select().from(contentTable).orderBy(contentTable.key));
});

/** Only existing keys can be edited (no creating arbitrary rows). */
router.patch("/content/:key", requireAuth("content.manage"), async (req, res): Promise<void> => {
  const params = UpdateContentParams.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = UpdateContentBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const [before] = await db.select().from(contentTable).where(eq(contentTable.key, params.data.key));
  const [entry] = await db
    .update(contentTable)
    .set({ value: body.data.value })
    .where(eq(contentTable.key, params.data.key))
    .returning();
  if (!entry) {
    res.status(404).json({ error: "Content block not found" });
    return;
  }
  await audit(req, "content.update", "content", entry.key);
  if (before) void cleanupMedia(replacedMedia(before.value, entry.value));
  res.json(entry);
});

export default router;
