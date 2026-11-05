import { Router, type IRouter } from "express";
import { and, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db, ordersTable, type Role } from "@workspace/db";
import { CreateOrderBody, ListOrdersQueryParams, UpdateOrderStatusBody, UpdateOrderStatusParams } from "@workspace/api-zod";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { badRequest } from "../lib/http";
import { notifyOrder } from "../lib/notify";
import {
  OrderError,
  adminOrderView,
  cancelOrder,
  changeOrderStatus,
  latestPayment,
  normalizeCode,
  placeOrder,
  publicOrderView,
  recordManualPayment,
  refreshPayment,
  startOnlinePayment,
  tokenHash,
} from "../lib/orders";
import { isOnline } from "../lib/payments";
import { can } from "../lib/permissions";
import { normalizePhone, samePhone } from "../lib/phone";
import { safeEqual } from "../lib/password";
import { limiter } from "../lib/rate-limit";
import { loadSettings } from "../lib/settings";
import { logger } from "../lib/logger";

const router: IRouter = Router();

// Stops one visitor from flooding the kitchen with fake orders.
const orderLimiter = limiter("orders", {
  windowMs: 10 * 60 * 1000,
  limit: 10,
  skipFailedRequests: true,
  message: { error: "Too many orders from this device. Please wait a few minutes." },
});
// Tracking is guessable-code protected: 8 random characters + phone or secret token, and rate limited.
const trackLimiter = limiter("track", { windowMs: 15 * 60 * 1000, limit: 30, message: { error: "Too many lookups. Please wait a few minutes." } });
const payLimiter = limiter("pay", { windowMs: 15 * 60 * 1000, limit: 10, message: { error: "Too many payment attempts. Please wait a few minutes." } });

const emailOk = z.string().trim().toLowerCase().email().max(254);

const sendOrderError = (res: import("express").Response, err: unknown): boolean => {
  if (err instanceof OrderError) {
    res.status(err.status).json({ error: err.message, ...(err.code ? { code: err.code } : {}) });
    return true;
  }
  return false;
};

/**
 * Public checkout. The client sends ONLY product ids, quantities and choices.
 * Prices, fees and the total are computed on the server.
 */
router.post("/orders", orderLimiter, async (req, res): Promise<void> => {
  const parsed = CreateOrderBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const b = parsed.data;
  if (b.website) {
    // Honeypot filled → a bot. Pretend nothing happened.
    res.status(400).json({ error: "Could not place the order" });
    return;
  }
  const settings = await loadSettings();
  const phone = normalizePhone(b.customerPhone, settings.checkout.phoneCountryCode);
  if (!phone) return badRequest(res, "Enter a valid phone number, e.g. 0772 123456 or +256 772 123456");
  let email = "";
  if (b.customerEmail && b.customerEmail.trim()) {
    const e = emailOk.safeParse(b.customerEmail);
    if (!e.success) return badRequest(res, "Enter a valid email address or leave it empty");
    email = e.data;
  }
  if (!b.customerName.trim()) return badRequest(res, "Enter your name");
  try {
    const { order, accessToken } = await placeOrder(
      {
        customerName: b.customerName.trim(),
        customerPhone: phone,
        customerEmail: email,
        items: b.items,
        fulfillment: b.fulfillment,
        deliveryZoneId: b.deliveryZoneId,
        deliveryAddress: b.deliveryAddress,
        deliveryNote: b.deliveryNote,
        paymentMethod: b.paymentMethod,
      },
      settings,
    );
    let checkoutUrl: string | null = null;
    if (isOnline(order.paymentMethod)) {
      try {
        const payment = await startOnlinePayment(order, settings);
        checkoutUrl = payment.checkoutUrl;
      } catch (err) {
        logger.warn({ err: (err as Error).message, order: order.code }, "Could not start online payment");
        await cancelOrder(order.id, "Online payment could not be started");
        res.status(502).json({ error: "The payment service is not responding. Please try again, or choose another payment method." });
        return;
      }
    }
    notifyOrder("placed", order, settings);
    res.status(201).json({
      code: order.code,
      accessToken,
      total: order.total,
      currency: order.currency,
      status: order.status,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      checkoutUrl,
    });
  } catch (err) {
    if (sendOrderError(res, err)) return;
    throw err;
  }
});

const TrackBody = z
  .object({
    code: z.string().min(4).max(20),
    phone: z.string().max(30).optional(),
    token: z.string().max(100).optional(),
  })
  .strict()
  .refine((v) => v.phone || v.token, "Enter the phone number used for the order");

const NOT_FOUND = "We couldn't find an order with that code and phone number.";

/** Finds an order by code + (phone OR the secret token from the confirmation page). */
async function findForCustomer(body: z.infer<typeof TrackBody>) {
  const code = normalizeCode(body.code);
  const [order] = await db.select().from(ordersTable).where(eq(ordersTable.code, code));
  if (!order) return null;
  if (body.token && order.accessTokenHash && safeEqual(tokenHash(body.token), order.accessTokenHash)) return order;
  if (body.phone && order.customerPhone && samePhone(body.phone, order.customerPhone)) return order;
  return null;
}

router.post("/orders/track", trackLimiter, async (req, res): Promise<void> => {
  const parsed = TrackBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  let order = await findForCustomer(parsed.data);
  if (!order) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  const settings = await loadSettings();
  let payment = await latestPayment(order.id);
  // The customer just came back from the payment page: ask the provider
  // directly (never trust the redirect's query string). Throttled per payment.
  if (payment && payment.status === "pending" && isOnline(payment.provider) && (!payment.lastCheckedAt || Date.now() - payment.lastCheckedAt.getTime() > 5000)) {
    try {
      const r = await refreshPayment(payment, "verify");
      if (r?.becamePaid && r.order) notifyOrder("paid", r.order, settings);
      if (r?.order) order = r.order;
      if (r?.payment) payment = r.payment;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Payment verify failed (will retry)");
    }
  }
  res.set("Cache-Control", "no-store").json(publicOrderView(order, payment, settings));
});

/** Start a new payment attempt for an unpaid online order (e.g. the customer closed the page). */
router.post("/orders/pay", payLimiter, async (req, res): Promise<void> => {
  const parsed = TrackBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const order = await findForCustomer(parsed.data);
  if (!order) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }
  const settings = await loadSettings();
  const view = publicOrderView(order, null, settings);
  if (!view.canRetryPayment) return badRequest(res, "This order can't be paid online");
  const prev = await latestPayment(order.id);
  if (prev?.status === "pending" && prev.checkoutUrl && Date.now() - prev.createdAt.getTime() < 10 * 60_000) {
    res.json({ checkoutUrl: prev.checkoutUrl });
    return;
  }
  try {
    const payment = await startOnlinePayment(order, settings);
    if (order.paymentStatus === "failed") await db.update(ordersTable).set({ paymentStatus: "pending" }).where(eq(ordersTable.id, order.id));
    res.json({ checkoutUrl: payment.checkoutUrl });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Retry payment failed");
    res.status(502).json({ error: "The payment service is not responding. Please try again in a moment." });
  }
});

// ----------------------------------------------------------------- staff

/** Staff: contains customer personal data. */
router.get("/orders", requireAuth("orders.view"), async (req, res): Promise<void> => {
  const parsed = ListOrdersQueryParams.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);
  const filters: (SQL | undefined)[] = [];
  if (parsed.data.status) filters.push(eq(ordersTable.status, parsed.data.status));
  if (parsed.data.paymentStatus) filters.push(eq(ordersTable.paymentStatus, parsed.data.paymentStatus));
  const q = parsed.data.search?.trim();
  if (q) {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const digits = q.replace(/\D/g, "");
    filters.push(
      or(
        ilike(ordersTable.code, pattern),
        ilike(ordersTable.customerName, pattern),
        digits.length >= 4 ? ilike(ordersTable.customerPhone, `%${digits.slice(-9)}%`) : undefined,
      ),
    );
  }
  const orders = await db
    .select()
    .from(ordersTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(ordersTable.createdAt))
    .limit(500);
  res.set("Cache-Control", "no-store").json(orders.map(adminOrderView));
});

router.patch("/orders/:id/status", requireAuth("orders.update"), async (req, res): Promise<void> => {
  const params = UpdateOrderStatusParams.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = UpdateOrderStatusBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  try {
    const result = await changeOrderStatus(params.data.id, body.data.status, req.user!.username);
    if (!result) {
      res.status(404).json({ error: "Order not found" });
      return;
    }
    if (result.previous !== result.order.status) {
      await audit(req, "order.status", "order", result.order.id, { code: result.order.code, from: result.previous, to: result.order.status });
      notifyOrder("status", result.order, await loadSettings());
    }
    res.json(adminOrderView(result.order));
  } catch (err) {
    if (sendOrderError(res, err)) return;
    throw err;
  }
});

const PaymentAction = z.object({ action: z.enum(["mark_paid", "mark_refunded"]) }).strict();

/** Record cash received (COD/pickup) or a refund done outside the app (managers+ for refunds). */
router.post("/orders/:id/payment", requireAuth("orders.markPaid"), async (req, res): Promise<void> => {
  const id = z.coerce.number().int().positive().safeParse(req.params.id);
  if (!id.success) return badRequest(res, "Invalid order id");
  const body = PaymentAction.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  if (body.data.action === "mark_refunded" && !can(req.user!.role as Role, "orders.refund")) {
    res.status(403).json({ error: "Only a manager or owner can record refunds", code: "FORBIDDEN" });
    return;
  }
  try {
    const order = await recordManualPayment(id.data, body.data.action, req.user!.username);
    await audit(req, body.data.action === "mark_paid" ? "order.mark_paid" : "order.mark_refunded", "order", order.id, { code: order.code, total: order.total });
    res.json(adminOrderView(order));
  } catch (err) {
    if (sendOrderError(res, err)) return;
    throw err;
  }
});

export default router;
