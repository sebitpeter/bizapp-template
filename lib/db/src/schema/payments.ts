import { index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex, doublePrecision } from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";

export const PAYMENT_STATUSES = ["pending", "paid", "failed", "refunded"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** One row per attempt to pay online (an order can have several attempts). */
export const paymentsTable = pgTable(
  "payments",
  {
    id: serial("id").primaryKey(),
    orderId: integer("order_id").notNull().references(() => ordersTable.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(), // flutterwave | pesapal | mock
    reference: text("reference").notNull(), // OUR unique reference (tx_ref / merchant reference)
    providerRef: text("provider_ref"), // THEIR id (Flutterwave transaction id / Pesapal OrderTrackingId)
    amount: doublePrecision("amount").notNull(),
    currency: text("currency").notNull(),
    status: text("status").$type<PaymentStatus>().notNull().default("pending"),
    checkoutUrl: text("checkout_url"),
    method: text("method"), // e.g. "mobilemoneyuganda", "card" (from the provider)
    failureReason: text("failure_reason"),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    raw: jsonb("raw").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("payments_reference_unique").on(t.reference), index("payments_order_idx").on(t.orderId), index("payments_provider_ref_idx").on(t.providerRef)],
);
export type Payment = typeof paymentsTable.$inferSelect;

/** Every webhook we accepted, keyed so the same event is never processed twice. */
export const webhookEventsTable = pgTable(
  "webhook_events",
  {
    id: serial("id").primaryKey(),
    provider: text("provider").notNull(),
    eventKey: text("event_key").notNull(),
    reference: text("reference"),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("webhook_events_key_unique").on(t.provider, t.eventKey)],
);
