import crypto from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  db,
  ordersTable,
  paymentsTable,
  productsTable,
  type Order,
  type OrderHistoryEntry,
  type OrderLine,
  type Payment,
} from "@workspace/db";
import type { OrderStatus, PaymentMethodId, SiteSettings } from "@workspace/business";
import { env } from "./env";
import { logger } from "./logger";
import { roundFor } from "./money";
import { availableMethods, isOnline, providers } from "./payments";
import type { VerifyResult } from "./payments/types";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export class OrderError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) {
    super(message);
  }
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
export function newOrderCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}
/** Accepts "abcd-1234", "ABCD1234", " abcd 1234 " … → "ABCD-1234". */
export const normalizeCode = (code: string) => {
  const raw = String(code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  return raw.length === 8 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
};
export const tokenHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex");

const entry = (type: OrderHistoryEntry["type"], value: string, by?: string): OrderHistoryEntry => ({ at: new Date().toISOString(), type, value, ...(by ? { by } : {}) });

export interface PlaceOrderInput {
  customerName: string;
  customerPhone: string; // already normalised to E.164
  customerEmail: string;
  items: { productId: number; quantity: number }[];
  fulfillment: "delivery" | "pickup";
  deliveryZoneId?: string;
  deliveryAddress?: string;
  deliveryNote?: string;
  paymentMethod: PaymentMethodId;
}

/** Takes stock for the given lines. Throws OrderError(409) if any product doesn't have enough. */
async function reserveStock(tx: Tx, lines: { productId: number; quantity: number; name: string }[]): Promise<void> {
  for (const line of [...lines].sort((a, b) => a.productId - b.productId)) {
    // Single atomic statement: decrements only if enough is left. Two shoppers
    // racing for the last cake can't both get it.
    const rows = await tx
      .update(productsTable)
      .set({ stock: sql`${productsTable.stock} - ${line.quantity}` })
      .where(and(eq(productsTable.id, line.productId), sql`(${productsTable.stock} IS NULL OR ${productsTable.stock} >= ${line.quantity})`))
      .returning({ id: productsTable.id, stock: productsTable.stock });
    if (rows.length === 0) {
      const [p] = await tx.select({ stock: productsTable.stock }).from(productsTable).where(eq(productsTable.id, line.productId));
      const left = p?.stock ?? 0;
      throw new OrderError(409, left > 0 ? `Only ${left} × ${line.name} left in stock` : `${line.name} is sold out`, "OUT_OF_STOCK");
    }
  }
}

/** Gives the order's quantities back to stock (once). */
async function releaseStock(tx: Tx, order: Order): Promise<void> {
  if (!order.stockReserved) return;
  for (const line of order.items as OrderLine[]) {
    await tx
      .update(productsTable)
      .set({ stock: sql`${productsTable.stock} + ${line.quantity}` })
      .where(and(eq(productsTable.id, line.productId), sql`${productsTable.stock} IS NOT NULL`));
  }
  await tx.update(ordersTable).set({ stockReserved: false }).where(eq(ordersTable.id, order.id));
}

/**
 * Creates an order. Prices, fees and totals are computed HERE from the
 * database and settings; nothing price-related is accepted from the browser.
 * Stock is reserved in the same transaction.
 */
export async function placeOrder(input: PlaceOrderInput, settings: SiteSettings): Promise<{ order: Order; accessToken: string }> {
  const currency = settings.currency.code;
  const co = settings.checkout;
  if (!availableMethods(settings).includes(input.paymentMethod)) throw new OrderError(400, "That payment method is not available");
  if (input.fulfillment === "delivery" && !co.delivery.enabled) throw new OrderError(400, "Delivery is not available right now");
  if (input.fulfillment === "pickup" && !co.pickup.enabled) throw new OrderError(400, "Pickup is not available right now");

  let deliveryFee = 0;
  let zoneName: string | null = null;
  if (input.fulfillment === "delivery") {
    const zone = co.delivery.zones.find((z) => z.id === input.deliveryZoneId);
    if (!zone) throw new OrderError(400, "Choose a delivery area");
    if (!input.deliveryAddress || input.deliveryAddress.trim().length < 4) throw new OrderError(400, "Enter a delivery address");
    deliveryFee = zone.fee;
    zoneName = zone.name;
  }

  const quantities = new Map<number, number>();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  for (const q of quantities.values()) if (q > 50) throw new OrderError(400, "Maximum 50 of one product per order");

  for (let attempt = 0; attempt < 3; attempt++) {
    const accessToken = crypto.randomBytes(24).toString("base64url");
    const code = newOrderCode();
    try {
      const order = await db.transaction(async (tx) => {
        const products = await tx.select().from(productsTable).where(inArray(productsTable.id, [...quantities.keys()])).orderBy(asc(productsTable.id));
        const byId = new Map(products.map((p) => [p.id, p]));
        const lines: OrderLine[] = [];
        for (const [productId, quantity] of quantities) {
          const p = byId.get(productId);
          if (!p) throw new OrderError(400, `Product ${productId} does not exist`);
          if (!p.available || p.stock === 0) throw new OrderError(409, `${p.name} is sold out`, "OUT_OF_STOCK");
          lines.push({ productId, name: p.name, quantity, unitPrice: p.price });
        }
        const subtotal = roundFor(currency, lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
        if (co.minOrder > 0 && subtotal < co.minOrder) throw new OrderError(400, `The minimum order is ${co.minOrder} ${currency}`);
        const fee = input.fulfillment === "delivery" && co.delivery.freeOver > 0 && subtotal >= co.delivery.freeOver ? 0 : deliveryFee;
        const total = roundFor(currency, subtotal + fee);
        await reserveStock(tx, lines);
        const [created] = await tx
          .insert(ordersTable)
          .values({
            code,
            accessTokenHash: tokenHash(accessToken),
            customerName: input.customerName,
            customerEmail: input.customerEmail,
            customerPhone: input.customerPhone,
            items: lines,
            subtotal,
            deliveryFee: roundFor(currency, fee),
            total,
            currency,
            fulfillment: input.fulfillment,
            deliveryZone: zoneName,
            deliveryAddress: input.fulfillment === "delivery" ? input.deliveryAddress!.trim() : null,
            deliveryNote: input.deliveryNote?.trim() || null,
            status: "Pending",
            paymentMethod: input.paymentMethod,
            paymentStatus: "pending",
            stockReserved: true,
            history: [entry("status", "Pending", "customer")],
          })
          .returning();
        return created;
      });
      return { order, accessToken };
    } catch (err) {
      if (err instanceof OrderError) throw err;
      const code23505 = (err as { code?: string; cause?: { code?: string } })?.code === "23505" || (err as { cause?: { code?: string } })?.cause?.code === "23505";
      if (code23505 && attempt < 2) continue; // code collision: try another
      throw err;
    }
  }
  throw new OrderError(500, "Could not create the order");
}

export const returnUrlFor = (order: Order) => `${env.publicUrl}/order/${encodeURIComponent(order.code ?? "")}`;

/** Creates a payment attempt at the provider and returns where to send the customer. */
export async function startOnlinePayment(order: Order, settings: SiteSettings): Promise<Payment> {
  if (!isOnline(order.paymentMethod)) throw new OrderError(400, "This order is paid in cash");
  const provider = providers[order.paymentMethod];
  const reference = `${order.code}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const [payment] = await db
    .insert(paymentsTable)
    .values({ orderId: order.id, provider: provider.id, reference, amount: order.total, currency: order.currency, status: "pending" })
    .returning();
  try {
    const result = await provider.initiate({ order, payment, settings, returnUrl: returnUrlFor(order) });
    const [updated] = await db
      .update(paymentsTable)
      .set({ checkoutUrl: result.checkoutUrl, providerRef: result.providerRef ?? null, updatedAt: new Date() })
      .where(eq(paymentsTable.id, payment.id))
      .returning();
    return updated;
  } catch (err) {
    await db
      .update(paymentsTable)
      .set({ status: "failed", failureReason: (err as Error).message.slice(0, 200), updatedAt: new Date() })
      .where(eq(paymentsTable.id, payment.id));
    throw err;
  }
}

/** Cancels an order (releasing stock). Used when payment can't start or expires. */
export async function cancelOrder(orderId: number, reason: string, by = "system"): Promise<Order | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order || order.status === "Cancelled") return order ?? null;
    await releaseStock(tx, order);
    const history = [...(order.history ?? []), entry("status", "Cancelled", by), entry("note", reason, by)];
    const [updated] = await tx
      .update(ordersTable)
      .set({ status: "Cancelled", history, stockReserved: false, updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning();
    return updated;
  });
}

/**
 * The ONLY place an online payment becomes "paid". Runs in a transaction with
 * row locks, is idempotent (a second webhook / poll for the same result does
 * nothing) and refuses results whose amount/currency/reference don't match.
 */
export async function applyPaymentResult(
  paymentId: number,
  result: VerifyResult,
  source: string,
): Promise<{ changed: boolean; order: Order | null; payment: Payment | null; becamePaid: boolean }> {
  return db.transaction(async (tx) => {
    const [payment] = await tx.select().from(paymentsTable).where(eq(paymentsTable.id, paymentId)).for("update");
    if (!payment) return { changed: false, order: null, payment: null, becamePaid: false };
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, payment.orderId)).for("update");
    const now = new Date();
    const base = { lastCheckedAt: now, updatedAt: now, ...(result.providerRef && !payment.providerRef ? { providerRef: result.providerRef } : {}) };

    if (result.status === "pending" || payment.status === result.status || payment.status === "refunded") {
      await tx.update(paymentsTable).set(base).where(eq(paymentsTable.id, payment.id));
      return { changed: false, order, payment, becamePaid: false };
    }

    let status = result.status;
    let failureReason = result.reason ?? null;
    if (status === "paid") {
      const tolerance = 10 ** -2;
      if (result.reference && result.reference !== payment.reference) {
        status = "failed";
        failureReason = "Reference mismatch";
      } else if (!result.currency || result.currency !== payment.currency) {
        status = "failed";
        failureReason = `Currency mismatch (${result.currency || "?"})`;
      } else if (!(Number(result.amount) + tolerance >= payment.amount)) {
        status = "failed";
        failureReason = `Amount too low (${result.amount} < ${payment.amount})`;
      }
      if (status === "failed") logger.warn({ paymentId: payment.id, failureReason }, "Payment result rejected");
    }
    if (payment.status === "paid" && status !== "refunded") {
      // Never downgrade a confirmed payment because of a late/odd event.
      await tx.update(paymentsTable).set(base).where(eq(paymentsTable.id, payment.id));
      return { changed: false, order, payment, becamePaid: false };
    }

    const [updatedPayment] = await tx
      .update(paymentsTable)
      .set({ ...base, status, failureReason, method: result.method ?? payment.method, raw: result.raw ?? payment.raw })
      .where(eq(paymentsTable.id, payment.id))
      .returning();

    if (!order) return { changed: true, order: null, payment: updatedPayment, becamePaid: false };
    const history = [...(order.history ?? [])];
    const patch: Partial<Order> = { updatedAt: now };
    let becamePaid = false;
    if (status === "paid" && order.paymentStatus !== "paid") {
      becamePaid = true;
      patch.paymentStatus = "paid";
      patch.paidAt = now;
      history.push(entry("payment", `paid (${updatedPayment.method ?? payment.provider})`, source));
      if (order.status === "Pending") {
        patch.status = "Confirmed";
        history.push(entry("status", "Confirmed", "system"));
      } else if (order.status === "Cancelled") {
        history.push(entry("note", "Payment arrived after the order was cancelled — refund it or re-open the order.", "system"));
      }
    } else if (status === "failed" && order.paymentStatus === "pending") {
      patch.paymentStatus = "failed";
      history.push(entry("payment", `failed${failureReason ? `: ${failureReason}` : ""}`, source));
    } else if (status === "refunded" && order.paymentStatus === "paid") {
      patch.paymentStatus = "refunded";
      history.push(entry("payment", "refunded / reversed", source));
    }
    patch.history = history;
    const [updatedOrder] = await tx.update(ordersTable).set(patch).where(eq(ordersTable.id, order.id)).returning();
    return { changed: true, order: updatedOrder, payment: updatedPayment, becamePaid };
  });
}

/** Asks the provider about a payment (server-to-server) and applies the answer. */
export async function refreshPayment(payment: Payment, source: string) {
  if (!isOnline(payment.provider)) return null;
  const result = await providers[payment.provider].verify(payment);
  return applyPaymentResult(payment.id, result, source);
}

export async function latestPayment(orderId: number): Promise<Payment | null> {
  const [p] = await db.select().from(paymentsTable).where(eq(paymentsTable.orderId, orderId)).orderBy(desc(paymentsTable.id)).limit(1);
  return p ?? null;
}

/** Staff changes the fulfilment status. Cancelling returns stock; re-opening takes it again. */
export async function changeOrderStatus(orderId: number, status: OrderStatus, by: string): Promise<{ order: Order; previous: string } | null> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) return null;
    if (order.status === status) return { order, previous: order.status };
    if (status === "Cancelled") await releaseStock(tx, order);
    let stockReserved = status === "Cancelled" ? false : order.stockReserved;
    if (order.status === "Cancelled" && status !== "Cancelled" && !order.stockReserved) {
      await reserveStock(tx, order.items as OrderLine[]);
      stockReserved = true;
    }
    const [updated] = await tx
      .update(ordersTable)
      .set({ status, stockReserved, history: [...(order.history ?? []), entry("status", status, by)], updatedAt: new Date() })
      .where(eq(ordersTable.id, orderId))
      .returning();
    return { order: updated, previous: order.status };
  });
}

/** Staff records cash received, or a refund made outside the app. */
export async function recordManualPayment(orderId: number, action: "mark_paid" | "mark_refunded", by: string): Promise<Order> {
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(ordersTable).where(eq(ordersTable.id, orderId)).for("update");
    if (!order) throw new OrderError(404, "Order not found");
    const history = [...(order.history ?? [])];
    let patch: Partial<Order>;
    if (action === "mark_paid") {
      if (order.paymentMethod !== "cod") throw new OrderError(400, "Online payments are confirmed by the payment provider, not by hand");
      if (order.paymentStatus === "paid") return order;
      if (order.status === "Cancelled") throw new OrderError(400, "Re-open the order before recording a payment");
      patch = { paymentStatus: "paid", paidAt: new Date() };
      history.push(entry("payment", "paid (cash)", by));
    } else {
      if (order.paymentStatus !== "paid") throw new OrderError(400, "Only paid orders can be marked as refunded");
      patch = { paymentStatus: "refunded" };
      history.push(entry("payment", "refunded", by));
      if (order.paymentMethod !== "cod") {
        await tx.update(paymentsTable).set({ status: "refunded", updatedAt: new Date() }).where(and(eq(paymentsTable.orderId, order.id), eq(paymentsTable.status, "paid")));
      }
    }
    const [updated] = await tx.update(ordersTable).set({ ...patch, history, updatedAt: new Date() }).where(eq(ordersTable.id, order.id)).returning();
    return updated;
  });
}

/** What a customer may see about their own order (no internal ids, no other people's data). */
export function publicOrderView(order: Order, payment: Payment | null, settings: SiteSettings) {
  const canPay =
    isOnline(order.paymentMethod) && order.status !== "Cancelled" && (order.paymentStatus === "pending" || order.paymentStatus === "failed");
  return {
    code: order.code,
    status: order.status,
    paymentStatus: order.paymentStatus,
    paymentMethod: order.paymentMethod,
    customerName: order.customerName,
    items: order.items as OrderLine[],
    subtotal: order.subtotal,
    deliveryFee: order.deliveryFee,
    total: order.total,
    currency: order.currency,
    fulfillment: order.fulfillment,
    deliveryZone: order.deliveryZone,
    pickupAddress: order.fulfillment === "pickup" ? settings.checkout.pickup.address : null,
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
    history: (order.history ?? []).filter((h) => h.type !== "note").map(({ at, type, value }) => ({ at, type, value })),
    checkoutUrl: canPay && payment?.status === "pending" && payment.checkoutUrl ? payment.checkoutUrl : null,
    canRetryPayment: canPay,
    expiresAt: canPay ? new Date(order.createdAt.getTime() + env.paymentTimeoutMinutes * 60_000).toISOString() : null,
  };
}

export function adminOrderView(order: Order) {
  return {
    ...order,
    accessTokenHash: undefined,
    items: order.items as OrderLine[],
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    paidAt: order.paidAt?.toISOString() ?? null,
  };
}
