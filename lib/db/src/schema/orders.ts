import { createInsertSchema } from "drizzle-zod";
import { boolean, doublePrecision, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export type OrderLine = {
  productId: number;
  name: string;
  quantity: number;
  unitPrice: number;
};

export type OrderHistoryEntry = { at: string; type: "status" | "payment" | "note"; value: string; by?: string };

export const ordersTable = pgTable(
  "orders",
  {
    id: serial("id").primaryKey(),
    /** Public order code customers use to track (random, not guessable). */
    code: text("code"),
    /** sha256 of the secret in the confirmation link (lets the buyer view the order without typing their phone). */
    accessTokenHash: text("access_token_hash"),
    customerName: text("customer_name").notNull(),
    customerEmail: text("customer_email").notNull().default(""),
    customerPhone: text("customer_phone").notNull().default(""),
    items: jsonb("items").$type<OrderLine[]>().notNull(),
    subtotal: doublePrecision("subtotal").notNull().default(0),
    deliveryFee: doublePrecision("delivery_fee").notNull().default(0),
    total: doublePrecision("total").notNull(),
    currency: text("currency").notNull().default("USD"),
    fulfillment: text("fulfillment").$type<"delivery" | "pickup">().notNull().default("delivery"),
    deliveryZone: text("delivery_zone"),
    deliveryAddress: text("delivery_address"),
    status: text("status").notNull().default("Pending"),
    paymentMethod: text("payment_method").notNull().default("cod"),
    paymentStatus: text("payment_status").$type<"pending" | "paid" | "failed" | "refunded">().notNull().default("pending"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    /** true while this order's quantities are taken out of product stock. */
    stockReserved: boolean("stock_reserved").notNull().default(false),
    history: jsonb("history").$type<OrderHistoryEntry[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deliveryNote: text("delivery_note"),
  },
  (t) => [uniqueIndex("orders_code_unique").on(t.code), index("orders_created_idx").on(t.createdAt), index("orders_payment_idx").on(t.paymentStatus)],
);

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
