import { createInsertSchema } from "drizzle-zod";
import { sql } from "drizzle-orm";
import { boolean, check, doublePrecision, integer, pgTable, serial, text } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const productsTable = pgTable("products", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull(),
  price: doublePrecision("price").notNull(),
  description: text("description").notNull(),
  imageUrl: text("image_url").notNull(),
  rating: doublePrecision("rating").notNull().default(5),
  reviewCount: integer("review_count").notNull().default(0),
  ingredients: text("ingredients").array().notNull().default([]),
  tags: text("tags").array().notNull().default([]),
  available: boolean("available").notNull().default(true),
  /** Units in stock. null = not tracked (always available while `available` is true). */
  stock: integer("stock"),
}, (t) => [check("products_stock_non_negative", sql`${t.stock} IS NULL OR ${t.stock} >= 0`)]);

export const insertProductSchema = createInsertSchema(productsTable).omit({ id: true });
export type InsertProduct = z.infer<typeof insertProductSchema>;
export type Product = typeof productsTable.$inferSelect;