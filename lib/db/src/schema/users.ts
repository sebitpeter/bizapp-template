import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

/** owner  = everything (branding, payments, staff, audit log)
 *  manager = orders + products, website text, reviews
 *  staff   = orders only */
export const ROLES = ["owner", "manager", "staff"] as const;
export type Role = (typeof ROLES)[number];

export const usersTable = pgTable(
  "users",
  {
    id: serial("id").primaryKey(),
    /** Unique sign-in name (lower-case letters, digits, dot, dash, underscore). */
    username: text("username").notNull(),
    email: text("email").notNull(), // always stored lower-case
    name: text("name").notNull(),
    role: text("role").$type<Role>().notNull().default("staff"),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    disabled: boolean("disabled").notNull().default(false),
    failedLogins: integer("failed_logins").notNull().default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_unique").on(sql`lower(${t.email})`),
    uniqueIndex("users_username_unique").on(sql`lower(${t.username})`),
  ],
);
export type User = typeof usersTable.$inferSelect;

/**
 * Server-side sessions. The cookie holds a random token; only its SHA-256
 * hash is stored, so a database leak does not leak usable sessions.
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token) hex
    userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
    csrfToken: text("csrf_token").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    ip: text("ip"),
    userAgent: text("user_agent"),
  },
  (t) => [index("sessions_user_idx").on(t.userId), index("sessions_expires_idx").on(t.expiresAt)],
);
export type Session = typeof sessionsTable.$inferSelect;

/** Who did what, when. Visible to owners in Admin → Audit log. */
export const auditLogTable = pgTable(
  "audit_log",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    userEmail: text("user_email"),
    action: text("action").notNull(), // e.g. "product.update"
    entity: text("entity"),
    entityId: text("entity_id"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_created_idx").on(t.createdAt), index("audit_action_idx").on(t.action)],
);
export type AuditEntry = typeof auditLogTable.$inferSelect;
