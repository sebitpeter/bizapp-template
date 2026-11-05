import crypto from "node:crypto";
import { Router, type IRouter } from "express";
import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, newsletterTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { env } from "../lib/env";
import { badRequest } from "../lib/http";
import { limiter } from "../lib/rate-limit";

const router: IRouter = Router();
const subscribeLimiter = limiter("newsletter", { windowMs: 60 * 60 * 1000, limit: 10, message: { error: "Too many sign-ups from this device. Please try later." } });

const Subscribe = z.object({ email: z.string().trim().toLowerCase().email().max(254), website: z.string().max(200).optional() }).strict();

/**
 * Same answer whether the address is new, already subscribed or a bot
 * (honeypot), so nobody can use this form to find out who is subscribed.
 */
router.post("/newsletter", subscribeLimiter, async (req, res): Promise<void> => {
  const parsed = Subscribe.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Enter a valid email address");
  if (!parsed.data.website) {
    const token = crypto.randomBytes(24).toString("base64url");
    await db
      .insert(newsletterTable)
      .values({ email: parsed.data.email, unsubscribeToken: token, source: "website" })
      .onConflictDoNothing();
    // Already on the list (maybe unsubscribed earlier): re-subscribe, keep the original token.
    await db
      .update(newsletterTable)
      .set({ status: "subscribed", unsubscribedAt: null })
      .where(and(sql`lower(${newsletterTable.email}) = ${parsed.data.email}`, eq(newsletterTable.status, "unsubscribed")));
  }
  res.status(202).json({ ok: true, message: "Thanks! You're on the list." });
});

const Unsubscribe = z.object({ token: z.string().min(10).max(100) }).strict();

/** Via the link in emails: /unsubscribe?token=... (the page POSTs here, so link scanners can't unsubscribe people). */
router.post("/newsletter/unsubscribe", subscribeLimiter, async (req, res): Promise<void> => {
  const parsed = Unsubscribe.safeParse(req.body);
  if (!parsed.success) return badRequest(res, "Invalid link");
  await db
    .update(newsletterTable)
    .set({ status: "unsubscribed", unsubscribedAt: new Date() })
    .where(eq(newsletterTable.unsubscribeToken, parsed.data.token));
  res.json({ ok: true, message: "You have been unsubscribed." });
});

router.get("/admin/newsletter", requireAuth("newsletter.view"), async (_req, res): Promise<void> => {
  const rows = await db.select().from(newsletterTable).orderBy(asc(newsletterTable.id));
  res.set("Cache-Control", "no-store").json(
    rows.map((r) => ({ id: r.id, email: r.email, status: r.status, createdAt: r.createdAt.toISOString(), unsubscribedAt: r.unsubscribedAt?.toISOString() ?? null })),
  );
});

/** CSV cells that start with = + - @ are treated as formulas by Excel; prefix them so they stay text. */
const csvCell = (v: string) => {
  const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return `"${safe.replace(/"/g, '""')}"`;
};

router.get("/admin/newsletter.csv", requireAuth("newsletter.view"), async (req, res): Promise<void> => {
  const rows = await db.select().from(newsletterTable).where(eq(newsletterTable.status, "subscribed")).orderBy(asc(newsletterTable.id));
  // unsubscribe_url: paste into your mailing tool so every email has a working "unsubscribe" link.
  const csv = [
    "email,subscribed_at,unsubscribe_url",
    ...rows.map((r) => [r.email, r.createdAt.toISOString(), `${env.publicUrl}/unsubscribe?token=${r.unsubscribeToken}`].map(csvCell).join(",")),
  ].join("\r\n");
  await audit(req, "newsletter.export", "newsletter", null, { rows: rows.length });
  res
    .set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="newsletter.csv"', "Cache-Control": "no-store" })
    .send(`\uFEFF${csv}\r\n`);
});

export default router;
