import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db, ordersTable, reviewsTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { badRequest } from "../lib/http";
import { limiter } from "../lib/rate-limit";
import { normalizeCode } from "../lib/orders";
import { samePhone } from "../lib/phone";

const router: IRouter = Router();
const reviewLimiter = limiter("reviews", { windowMs: 60 * 60 * 1000, limit: 5, message: { error: "Too many reviews from this device. Please try later." } });

const toJson = (r: typeof reviewsTable.$inferSelect) => ({ ...r, createdAt: r.createdAt.toISOString() });

/** Public: only reviews a manager approved. */
router.get("/reviews", async (_req, res): Promise<void> => {
  const rows = await db.select().from(reviewsTable).where(eq(reviewsTable.status, "approved")).orderBy(desc(reviewsTable.id)).limit(100);
  res.json(rows.map(toJson));
});

const ReviewBody = z
  .object({
    customerName: z.string().trim().min(1).max(60),
    quote: z.string().trim().min(10, "Please write at least a few words").max(800),
    rating: z.number().int().min(1).max(5),
    productName: z.string().trim().max(120).optional(),
    orderCode: z.string().max(20).optional(),
    phone: z.string().max(30).optional(),
    website: z.string().max(200).optional(), // honeypot
  })
  .strict();

/** Public: new reviews wait for moderation. "Verified" only when the order code + phone match a real order. */
router.post("/reviews", reviewLimiter, async (req, res): Promise<void> => {
  const parsed = ReviewBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const b = parsed.data;
  if (b.website) {
    res.status(202).json({ ok: true, status: "pending" });
    return;
  }
  let verified = false;
  if (b.orderCode && b.phone) {
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.code, normalizeCode(b.orderCode)));
    verified = Boolean(order && order.status !== "Cancelled" && samePhone(b.phone, order.customerPhone));
  }
  await db.insert(reviewsTable).values({
    customerName: b.customerName,
    quote: b.quote,
    rating: b.rating,
    productName: b.productName || null,
    verified,
    status: "pending",
  });
  res.status(202).json({ ok: true, status: "pending", verified });
});

router.get("/admin/reviews", requireAuth("reviews.moderate"), async (req, res): Promise<void> => {
  const status = z.enum(["approved", "pending", "hidden"]).optional().safeParse(req.query.status);
  if (!status.success) return badRequest(res, status.error);
  const rows = await db
    .select()
    .from(reviewsTable)
    .where(status.data ? eq(reviewsTable.status, status.data) : undefined)
    .orderBy(desc(reviewsTable.id))
    .limit(300);
  res.set("Cache-Control", "no-store").json(rows.map(toJson));
});

const Moderate = z.object({ status: z.enum(["approved", "pending", "hidden"]) }).strict();

router.patch("/admin/reviews/:id", requireAuth("reviews.moderate"), async (req, res): Promise<void> => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return badRequest(res, "Invalid review id");
  const body = Moderate.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  const [row] = await db.update(reviewsTable).set({ status: body.data.status }).where(eq(reviewsTable.id, id.data)).returning();
  if (!row) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await audit(req, `review.${body.data.status === "approved" ? "approve" : body.data.status === "hidden" ? "hide" : "pending"}`, "review", row.id);
  res.json(toJson(row));
});

router.delete("/admin/reviews/:id", requireAuth("reviews.moderate"), async (req, res): Promise<void> => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return badRequest(res, "Invalid review id");
  const [row] = await db.delete(reviewsTable).where(eq(reviewsTable.id, id.data)).returning();
  if (!row) {
    res.status(404).json({ error: "Review not found" });
    return;
  }
  await audit(req, "review.delete", "review", row.id);
  res.sendStatus(204);
});

export default router;
