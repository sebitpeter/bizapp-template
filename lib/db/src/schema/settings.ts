import { customType, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * Runtime branding/settings saved from Admin → Branding.
 * There is only ever one row (id = 1). `data` holds ONLY the fields the admin
 * changed; the API merges it over the defaults in business/business.config.ts.
 */
export const siteSettingsTable = pgTable("site_settings", {
  id: integer("id").primaryKey().default(1),
  data: jsonb("data").$type<Record<string, unknown>>().notNull().default({}),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

/**
 * Uploaded images (logo, favicon, hero, product photos).
 * `data` is filled when UPLOAD_STORAGE=db (default; survives redeploys on
 * Replit/Render). With UPLOAD_STORAGE=disk the bytes live in UPLOAD_DIR and
 * `data` is null.
 */
export const mediaTable = pgTable("media", {
  id: text("id").primaryKey(), // e.g. "9f3c...e1.png" (random, never user-controlled)
  contentType: text("content_type").notNull(),
  size: integer("size").notNull(),
  data: bytea("data"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MediaRow = typeof mediaTable.$inferSelect;
