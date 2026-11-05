import { Router, type IRouter } from "express";
import { UpdateSiteSettingsBody } from "@workspace/api-zod";
import { siteSettingsSchema } from "@workspace/business";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { cleanupMedia, replacedMedia } from "../lib/media";
import { badRequest } from "../lib/http";
import { loadSettings, resetSettings, saveSettings } from "../lib/settings";
import { can } from "../lib/permissions";
import type { Role } from "@workspace/db";

const router: IRouter = Router();

/** Public: the storefront reads branding (name, colours, logo...) from here. */
router.get("/settings", async (_req, res): Promise<void> => {
  res.set("Cache-Control", "no-cache");
  res.json(await loadSettings());
});

/** Owner: branding. Payment/delivery settings are kept unless the user may change payments too. */
router.put("/settings", requireAuth("settings.branding"), async (req, res): Promise<void> => {
  // Two layers: the generated contract schema, then the stricter business schema
  // (hex colours, safe image URLs, https-only social links, ...).
  const contract = UpdateSiteSettingsBody.safeParse(req.body);
  if (!contract.success) return badRequest(res, contract.error);
  const parsed = siteSettingsSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const before = await loadSettings();
  const next = can(req.user!.role as Role, "settings.payments") ? parsed.data : { ...parsed.data, checkout: before.checkout };
  const saved = await saveSettings(next);
  const changed = (Object.keys(next) as (keyof typeof next)[]).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(saved[k]));
  await audit(req, "settings.branding", "settings", 1, { changed });
  void cleanupMedia(replacedMedia(before, saved));
  res.json(saved);
});

router.delete("/settings", requireAuth("settings.branding", "settings.payments"), async (req, res): Promise<void> => {
  const before = await loadSettings();
  const saved = await resetSettings();
  await audit(req, "settings.reset", "settings", 1);
  void cleanupMedia(replacedMedia(before, saved));
  res.json(saved);
});

export default router;
