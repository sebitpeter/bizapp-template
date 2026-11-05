import { createInsertSchema } from "drizzle-zod";
import { pgTable, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const contentTable = pgTable("content_entries", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  label: text("label").notNull(),
});

export const insertContentSchema = createInsertSchema(contentTable);
export type InsertContent = z.infer<typeof insertContentSchema>;
export type Content = typeof contentTable.$inferSelect;