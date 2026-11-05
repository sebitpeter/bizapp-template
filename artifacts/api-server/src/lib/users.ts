import { count, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable, type Role } from "@workspace/db";
import { env, isProduction } from "./env";
import { hashPassword, passwordProblem } from "./password";
import { logger } from "./logger";

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, "Username: 3–32 characters, letters, digits, dot, dash or underscore");
export const emailSchema = z.string().trim().toLowerCase().max(254).email("Enter a valid email address");
export const nameSchema = z.string().trim().min(1, "Name is required").max(100);

export async function userCount(): Promise<number> {
  const [{ value }] = await db.select({ value: count() }).from(usersTable);
  return value;
}

export async function findByUsername(username: string) {
  const [u] = await db.select().from(usersTable).where(sql`lower(${usersTable.username}) = ${username.toLowerCase()}`);
  return u ?? null;
}
export async function findByEmail(email: string) {
  const [u] = await db.select().from(usersTable).where(sql`lower(${usersTable.email}) = ${email.toLowerCase()}`);
  return u ?? null;
}

export async function activeOwnerCount(): Promise<number> {
  const [{ value }] = await db
    .select({ value: count() })
    .from(usersTable)
    .where(sql`${usersTable.role} = 'owner' AND ${usersTable.disabled} = false`);
  return value;
}

/**
 * Creates the first owner inside a transaction holding an advisory lock, so two
 * simultaneous setup requests can't both succeed. Returns null if users already exist.
 */
export async function createFirstOwner(input: { username: string; email: string; name: string; password: string }) {
  const passwordHash = await hashPassword(input.password);
  return db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(724001)`);
    const [{ value }] = await tx.select({ value: count() }).from(usersTable);
    if (value > 0) return null;
    const [user] = await tx
      .insert(usersTable)
      .values({ username: input.username, email: input.email, name: input.name, role: "owner" as Role, passwordHash })
      .returning();
    return user;
  });
}

/** OWNER_USERNAME/OWNER_EMAIL/OWNER_PASSWORD → create the first owner on start (only when there are no users). */
export async function bootstrapOwner(): Promise<void> {
  const { username, email, password, name } = env.owner;
  if ((await userCount()) > 0) {
    if (password) logger.info("OWNER_PASSWORD is set but users already exist — it is ignored. You can remove it from your environment.");
    return;
  }
  if (!email || !password) {
    logger.warn(
      isProduction
        ? "No staff accounts yet. Set OWNER_USERNAME, OWNER_EMAIL and OWNER_PASSWORD (or SETUP_TOKEN and open /admin) to create the owner."
        : "No staff accounts yet. Open /admin to create the owner account, or set OWNER_EMAIL/OWNER_PASSWORD.",
    );
    return;
  }
  const u = usernameSchema.safeParse(username || email.split("@")[0]);
  const e = emailSchema.safeParse(email);
  const problem = passwordProblem(password, { email, username });
  if (!u.success || !e.success || problem) {
    logger.error({ problem: problem ?? "invalid OWNER_USERNAME or OWNER_EMAIL" }, "Could not create the owner from environment variables");
    return;
  }
  const user = await createFirstOwner({ username: u.data, email: e.data, name, password });
  if (user) logger.info({ username: user.username }, "Created the owner account from OWNER_* environment variables");
}

export async function getUser(id: number) {
  const [u] = await db.select().from(usersTable).where(eq(usersTable.id, id));
  return u ?? null;
}

export function toPublicUser(u: typeof usersTable.$inferSelect) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role,
    disabled: u.disabled,
    mustChangePassword: u.mustChangePassword,
    locked: Boolean(u.lockedUntil && u.lockedUntil > new Date()),
    lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
    createdAt: u.createdAt.toISOString(),
  };
}
