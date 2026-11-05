import { sql } from "drizzle-orm";
import { pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const newsletterTable = pgTable(
  "newsletter_subscribers",
  {
    id: serial("id").primaryKey(),
    email: text("email").notNull(), // lower-case
    status: text("status").$type<"subscribed" | "unsubscribed">().notNull().default("subscribed"),
    unsubscribeToken: text("unsubscribe_token").notNull(),
    source: text("source"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
  },
  (t) => [uniqueIndex("newsletter_email_unique").on(sql`lower(${t.email})`), uniqueIndex("newsletter_token_unique").on(t.unsubscribeToken)],
);
export type Subscriber = typeof newsletterTable.$inferSelect;
