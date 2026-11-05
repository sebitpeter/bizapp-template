import { Router, type IRouter, type Request } from "express";
import { and, eq } from "drizzle-orm";
import { checkoutSchema } from "@workspace/business";
import { db, paymentsTable, webhookEventsTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { env } from "../lib/env";
import { badRequest } from "../lib/http";
import { logger } from "../lib/logger";
import { notifyChannels, notifyOrder } from "../lib/notify";
import { refreshPayment } from "../lib/orders";
import { availableMethods, providers, providerStatus } from "../lib/payments";
import { pesapalIpnUrl } from "../lib/payments/pesapal";
import { safeEqual } from "../lib/password";
import { limiter, rateLimitBackend } from "../lib/rate-limit";
import { loadSettings, saveSettings } from "../lib/settings";

const router: IRouter = Router();
const webhookLimiter = limiter("webhook", { windowMs: 60 * 1000, limit: 120 });

/** Records an event; returns false if we've already processed exactly this event. */
async function firstTime(provider: string, eventKey: string, reference: string | null): Promise<boolean> {
  const rows = await db.insert(webhookEventsTable).values({ provider, eventKey: eventKey.slice(0, 200), reference }).onConflictDoNothing().returning({ id: webhookEventsTable.id });
  return rows.length > 0;
}
const forget = (provider: string, eventKey: string) =>
  db.delete(webhookEventsTable).where(and(eq(webhookEventsTable.provider, provider), eq(webhookEventsTable.eventKey, eventKey.slice(0, 200))));

async function findPayment(provider: string, reference: string) {
  if (!reference) return null;
  const [p] = await db.select().from(paymentsTable).where(and(eq(paymentsTable.provider, provider), eq(paymentsTable.reference, reference)));
  return p ?? null;
}

/**
 * Flutterwave webhook. Security:
 *  1. `verif-hash` header must equal FLW_SECRET_HASH (constant-time compare), else 401.
 *  2. The body is only a hint: we re-fetch the transaction from Flutterwave's
 *     API and check amount, currency and reference before marking anything paid.
 *  3. Idempotent: the same event (id + status) is processed once.
 */
router.post("/payments/webhook/flutterwave", webhookLimiter, async (req: Request, res): Promise<void> => {
  const expected = env.flutterwave.webhookHash;
  const got = req.get("verif-hash") ?? "";
  if (!expected || !got || !safeEqual(got, expected)) {
    logger.warn({ ip: req.ip }, "Flutterwave webhook with a bad signature was rejected");
    res.status(401).json({ error: "Invalid signature" });
    return;
  }
  const data = (req.body?.data ?? {}) as Record<string, unknown>;
  const event = String(req.body?.event ?? req.body?.["event.type"] ?? "unknown");
  const reference = String(data.tx_ref ?? data.txRef ?? "");
  const txId = data.id !== undefined ? String(data.id) : "";
  const payment = await findPayment("flutterwave", reference);
  if (!payment) {
    res.status(200).json({ ok: true, ignored: "unknown reference" });
    return;
  }
  const key = `${event}:${txId}:${String(data.status ?? "")}`;
  if (!(await firstTime("flutterwave", key, reference))) {
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }
  try {
    const target = txId && !payment.providerRef ? { ...payment, providerRef: txId } : payment;
    const result = await refreshPayment(target, "webhook");
    if (result?.becamePaid && result.order) notifyOrder("paid", result.order, await loadSettings());
    res.status(200).json({ ok: true });
  } catch (err) {
    await forget("flutterwave", key); // let Flutterwave's retry try again
    logger.warn({ err: (err as Error).message }, "Flutterwave webhook verify failed");
    res.status(500).json({ error: "Temporary error" });
  }
});

/**
 * Pesapal IPN (GET or POST). Pesapal doesn't sign IPNs, so the payload is
 * never trusted: we call GetTransactionStatus for the tracking id and apply
 * that answer. Unknown references are acknowledged and ignored.
 */
async function pesapalIpn(req: Request, res: import("express").Response): Promise<void> {
  const src = { ...(req.query as Record<string, unknown>), ...(typeof req.body === "object" && req.body ? req.body : {}) };
  const trackingId = String(src.OrderTrackingId ?? src.orderTrackingId ?? "").slice(0, 100);
  const reference = String(src.OrderMerchantReference ?? src.orderMerchantReference ?? "").slice(0, 100);
  const type = String(src.OrderNotificationType ?? src.orderNotificationType ?? "IPNCHANGE");
  const reply = (status: number) =>
    res.status(200).json({ orderNotificationType: type, orderTrackingId: trackingId, orderMerchantReference: reference, status });
  const payment = await findPayment("pesapal", reference);
  if (!payment || !trackingId || (payment.providerRef && payment.providerRef !== trackingId)) {
    reply(200);
    return;
  }
  try {
    const result = await refreshPayment({ ...payment, providerRef: payment.providerRef ?? trackingId }, "webhook");
    await firstTime("pesapal", `${trackingId}:${result?.payment?.status ?? "pending"}`, reference);
    if (result?.becamePaid && result.order) notifyOrder("paid", result.order, await loadSettings());
    reply(200);
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Pesapal IPN verify failed");
    reply(500);
  }
}
router.get("/payments/webhook/pesapal", webhookLimiter, pesapalIpn);
router.post("/payments/webhook/pesapal", webhookLimiter, pesapalIpn);

/** Public: which payment methods the checkout may show right now. */
router.get("/checkout/options", async (_req, res): Promise<void> => {
  const settings = await loadSettings();
  const methods = availableMethods(settings).map((id) =>
    id === "cod"
      ? { id, label: "Cash on delivery / pay at pickup", description: "Pay with cash or mobile money when you receive your order" }
      : { id, label: providers[id].label, description: providers[id].description, test: providers[id].mode() === "test" },
  );
  res.set("Cache-Control", "no-cache").json({ methods, currency: settings.currency, checkout: settings.checkout });
});

/** Owner: are the keys there? which mode? which URLs to paste into the dashboards? (never the key values) */
router.get("/admin/payments/status", requireAuth("settings.payments"), async (_req, res): Promise<void> => {
  const settings = await loadSettings();
  res.set("Cache-Control", "no-store").json({
    currency: settings.currency.code,
    providers: providerStatus(settings),
    available: availableMethods(settings),
    webhooks: {
      flutterwave: `${env.publicUrl}/api/payments/webhook/flutterwave`,
      pesapal: pesapalIpnUrl(),
    },
    publicUrl: env.publicUrl,
    publicUrlIsHttps: env.publicUrl.startsWith("https://"),
    notifications: notifyChannels(),
    rateLimits: rateLimitBackend(),
  });
});

/** Owner: turn payment methods on/off, delivery zones and fees, pickup. */
router.put("/admin/payments/settings", requireAuth("settings.payments"), async (req, res): Promise<void> => {
  const parsed = checkoutSchema.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error as never);
  const current = await loadSettings();
  for (const id of ["flutterwave", "pesapal"] as const) {
    if (parsed.data.methods[id] && !current.checkout.methods[id] && !providers[id].configured()) {
      return badRequest(res, `${id === "flutterwave" ? "Flutterwave" : "Pesapal"} keys are missing on the server (${providers[id].missing().join(", ")}). Add them to .env first.`);
    }
  }
  const saved = await saveSettings({ ...current, checkout: parsed.data });
  await audit(req, "settings.payments", "settings", 1, {
    methods: parsed.data.methods,
    zones: parsed.data.delivery.zones.length,
    deliveryEnabled: parsed.data.delivery.enabled,
    pickupEnabled: parsed.data.pickup.enabled,
  });
  res.json(saved.checkout);
});

export default router;
