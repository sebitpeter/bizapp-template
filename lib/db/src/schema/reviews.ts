import { createInsertSchema } from "drizzle-zod";
import { boolean, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const reviewsTable = pgTable("reviews", {
  id: serial("id").primaryKey(),
  customerName: text("customer_name").notNull(),
  quote: text("quote").notNull(),
  rating: integer("rating").notNull().default(5),
  verified: boolean("verified").notNull().default(true),
  productName: text("product_name"),
  /** approved = shown on the website; pending = waiting for a manager; hidden = rejected. */
  status: text("status").$type<"approved" | "pending" | "hidden">().notNull().default("approved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertReviewSchema = createInsertSchema(reviewsTable).omit({ id: true });
export type InsertReview = z.infer<typeof insertReviewSchema>;
export type Review = typeof reviewsTable.$inferSelect;