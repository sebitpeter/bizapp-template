import { Router, type IRouter } from "express";
import { and, desc, eq, lt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { auditLogTable, db, ROLES, usersTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { requireAuth, revokeSessions } from "../lib/auth";
import { badRequest, isUniqueViolation } from "../lib/http";
import { hashPassword, temporaryPassword } from "../lib/password";
import { activeOwnerCount, emailSchema, getUser, nameSchema, toPublicUser, usernameSchema } from "../lib/users";

/** Owner-only staff management + audit log. */
const router: IRouter = Router();
const idParam = z.coerce.number().int().positive();

router.get("/admin/users", requireAuth("users.manage"), async (_req, res): Promise<void> => {
  const users = await db.select().from(usersTable).orderBy(usersTable.id);
  res.set("Cache-Control", "no-store").json(users.map(toPublicUser));
});

const CreateUser = z.object({ name: nameSchema, username: usernameSchema, email: emailSchema, role: z.enum(ROLES) }).strict();

/** Creates the account with a one-time password that must be changed at first sign-in. Shown ONCE. */
router.post("/admin/users", requireAuth("users.manage"), async (req, res): Promise<void> => {
  const parsed = CreateUser.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const temp = temporaryPassword();
  try {
    const [user] = await db
      .insert(usersTable)
      .values({ ...parsed.data, passwordHash: await hashPassword(temp), mustChangePassword: true })
      .returning();
    await audit(req, "user.create", "user", user.id, { username: user.username, email: user.email, role: user.role });
    res.status(201).set("Cache-Control", "no-store").json({ user: toPublicUser(user), temporaryPassword: temp });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "That username or email is already used by another account" });
      return;
    }
    throw err;
  }
});

const UpdateUser = z
  .object({ name: nameSchema.optional(), email: emailSchema.optional(), role: z.enum(ROLES).optional(), disabled: z.boolean().optional() })
  .strict();

router.patch("/admin/users/:id", requireAuth("users.manage"), async (req, res): Promise<void> => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res, "Invalid user id");
  const parsed = UpdateUser.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  if (Object.keys(parsed.data).length === 0) return badRequest(res, "Nothing to update");
  const target = await getUser(id.data);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const self = target.id === req.user!.id;
  if (self && (parsed.data.disabled === true || (parsed.data.role && parsed.data.role !== target.role))) {
    return badRequest(res, "You can't disable your own account or change your own role. Ask another owner.");
  }
  const losesOwner = target.role === "owner" && !target.disabled && (parsed.data.disabled === true || (parsed.data.role && parsed.data.role !== "owner"));
  if (losesOwner && (await activeOwnerCount()) <= 1) {
    return badRequest(res, "There must always be at least one active owner.");
  }
  try {
    const [user] = await db
      .update(usersTable)
      .set({ ...parsed.data, updatedAt: new Date(), ...(parsed.data.disabled === false ? { failedLogins: 0, lockedUntil: null } : {}) })
      .where(eq(usersTable.id, target.id))
      .returning();
    if (parsed.data.disabled === true || (parsed.data.role && parsed.data.role !== target.role)) await revokeSessions(target.id);
    const changes: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) changes[k] = { from: (target as Record<string, unknown>)[k], to: v };
    await audit(req, parsed.data.disabled === true ? "user.disable" : parsed.data.disabled === false ? "user.enable" : "user.update", "user", user.id, {
      username: user.username,
      changes,
    });
    res.json(toPublicUser(user));
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "That email is already used by another account" });
      return;
    }
    throw err;
  }
});

/** Owner resets someone's password: new one-time password, forced change, all their sessions ended. */
router.post("/admin/users/:id/reset-password", requireAuth("users.manage"), async (req, res): Promise<void> => {
  const id = idParam.safeParse(req.params.id);
  if (!id.success) return badRequest(res, "Invalid user id");
  const target = await getUser(id.data);
  if (!target) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  if (target.id === req.user!.id) return badRequest(res, "Use “Change password” for your own account.");
  const temp = temporaryPassword();
  await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(temp), mustChangePassword: true, failedLogins: 0, lockedUntil: null, updatedAt: new Date() })
    .where(eq(usersTable.id, target.id));
  await revokeSessions(target.id);
  await audit(req, "user.reset_password", "user", target.id, { username: target.username });
  res.set("Cache-Control", "no-store").json({ temporaryPassword: temp });
});

const AuditQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  before: z.coerce.number().int().positive().optional(),
  action: z.string().regex(/^[a-z_.]{1,40}$/).optional(),
  userId: z.coerce.number().int().positive().optional(),
});

router.get("/admin/audit", requireAuth("audit.view"), async (req, res): Promise<void> => {
  const q = AuditQuery.safeParse(req.query);
  if (!q.success) return badRequest(res, q.error);
  const filters: SQL[] = [];
  if (q.data.before) filters.push(lt(auditLogTable.id, q.data.before));
  if (q.data.action) filters.push(sql`${auditLogTable.action} LIKE ${q.data.action.replace(/_/g, "\\_") + "%"}`);
  if (q.data.userId) filters.push(eq(auditLogTable.userId, q.data.userId));
  const rows = await db
    .select()
    .from(auditLogTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(auditLogTable.id))
    .limit(q.data.limit);
  res.set("Cache-Control", "no-store").json({
    entries: rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() })),
    nextBefore: rows.length === q.data.limit ? rows[rows.length - 1].id : null,
  });
});

export default router;
