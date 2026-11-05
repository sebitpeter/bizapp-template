import { Router, type IRouter, type Request, type Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, usersTable } from "@workspace/db";
import { audit } from "../lib/audit";
import {
  clearSessionCookies,
  endSession,
  loadSession,
  requireAuth,
  revokeSessions,
  sessionPayload,
  startSession,
} from "../lib/auth";
import { env, isProduction } from "../lib/env";
import { badRequest } from "../lib/http";
import { hashPassword, passwordProblem, PASSWORD_MAX, safeEqual, verifyDummy, verifyPassword } from "../lib/password";
import { limiter } from "../lib/rate-limit";
import { createFirstOwner, emailSchema, findByUsername, nameSchema, userCount, usernameSchema } from "../lib/users";
import { oauthStatus } from "../lib/oauth";

const router: IRouter = Router();

// Per-IP brute-force protection (on top of the per-account lockout below).
const loginLimiter = limiter("login", {
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Please wait 15 minutes and try again." },
});
const setupLimiter = limiter("setup", { windowMs: 15 * 60 * 1000, limit: 10, message: { error: "Too many attempts. Please wait." } });
const passwordLimiter = limiter("password", { windowMs: 15 * 60 * 1000, limit: 10, message: { error: "Too many attempts. Please wait." } });

const GENERIC = "Those sign-in details don't match an active account.";

const LoginBody = z.object({
  username: z.string().trim().min(1).max(64),
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(PASSWORD_MAX),
});

async function anonymousSession(res: Response) {
  res.json({ authenticated: false, setupRequired: (await userCount()) === 0, setupNeedsToken: isProduction || Boolean(env.setupToken), oauth: oauthStatus() });
}

router.get("/auth/session", async (req, res): Promise<void> => {
  res.set("Cache-Control", "no-store");
  const session = await loadSession(req);
  if (!session) {
    if (req.cookies?.sid || req.cookies?.["__Host-sid"]) clearSessionCookies(res);
    return anonymousSession(res);
  }
  res.json({ ...sessionPayload(session.user, session.csrfToken), setupRequired: false, oauth: oauthStatus() });
});

router.post("/auth/login", loginLimiter, async (req: Request, res: Response): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter your username, email address and password." });
    return;
  }
  const { username, email, password } = parsed.data;
  const user = await findByUsername(username);

  if (!user) {
    await verifyDummy(password); // same timing as a real check
    await audit(req, "auth.login_failed", "user", null, { username: username.slice(0, 64), reason: "unknown user" });
    res.status(401).json({ error: GENERIC });
    return;
  }

  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const minutes = Math.max(1, Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000));
    res.status(423).json({ error: `Too many failed attempts. This account is locked for ${minutes} more minute${minutes === 1 ? "" : "s"}.` });
    return;
  }

  const passwordOk = await verifyPassword(user.passwordHash, password);
  const emailOk = safeEqual(user.email.toLowerCase(), email.trim().toLowerCase());

  if (!passwordOk || !emailOk) {
    const failures = user.failedLogins + 1;
    const lock = failures >= env.loginMaxAttempts;
    await db
      .update(usersTable)
      .set(lock ? { failedLogins: 0, lockedUntil: new Date(Date.now() + env.loginLockMinutes * 60_000) } : { failedLogins: failures })
      .where(eq(usersTable.id, user.id));
    await audit(req, lock ? "auth.locked" : "auth.login_failed", "user", user.id, { reason: !passwordOk ? "password" : "email" }, { id: user.id, email: user.email });
    if (lock) {
      res.status(423).json({ error: `Too many failed attempts. This account is locked for ${env.loginLockMinutes} minutes.` });
      return;
    }
    res.status(401).json({ error: GENERIC });
    return;
  }

  if (user.disabled) {
    await audit(req, "auth.login_failed", "user", user.id, { reason: "disabled" }, { id: user.id, email: user.email });
    res.status(401).json({ error: GENERIC });
    return;
  }

  await db.update(usersTable).set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(usersTable.id, user.id));
  const csrf = await startSession(req, res, user);
  await audit(req, "auth.login", "user", user.id, { method: "password" }, { id: user.id, email: user.email });
  res.json({ ...sessionPayload(user, csrf), setupRequired: false, oauth: oauthStatus() });
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const session = await loadSession(req);
  if (session) await audit(req, "auth.logout", "user", session.user.id, undefined, { id: session.user.id, email: session.user.email });
  await endSession(req, res);
  return anonymousSession(res);
});

/** One-time setup: create the first owner. Refused as soon as any user exists. */
const SetupBody = z.object({
  setupToken: z.string().max(200).optional(),
  name: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: z.string().max(PASSWORD_MAX),
});

router.post("/auth/setup", setupLimiter, async (req, res): Promise<void> => {
  if ((await userCount()) > 0) {
    res.status(409).json({ error: "Setup is already complete. Sign in instead." });
    return;
  }
  const parsed = SetupBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { setupToken, name, username, email, password } = parsed.data;
  if (isProduction && !env.setupToken) {
    res.status(403).json({ error: "For safety, set SETUP_TOKEN (or OWNER_EMAIL/OWNER_PASSWORD) in the server environment first." });
    return;
  }
  if (env.setupToken && !safeEqual(setupToken ?? "", env.setupToken)) {
    res.status(403).json({ error: "The setup token is not correct." });
    return;
  }
  const problem = passwordProblem(password, { email, username });
  if (problem) return badRequest(res, problem);
  const user = await createFirstOwner({ username, email, name, password });
  if (!user) {
    res.status(409).json({ error: "Setup is already complete. Sign in instead." });
    return;
  }
  const csrf = await startSession(req, res, user);
  await audit(req, "auth.setup", "user", user.id, { username }, { id: user.id, email: user.email });
  res.status(201).json({ ...sessionPayload(user, csrf), setupRequired: false, oauth: oauthStatus() });
});

/** Anyone signed in can change their own password (required after an owner reset). */
const ChangePasswordBody = z.object({ currentPassword: z.string().max(PASSWORD_MAX), newPassword: z.string().max(PASSWORD_MAX) });

router.post("/auth/change-password", passwordLimiter, requireAuth(), async (req, res): Promise<void> => {
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user!.id));
  if (!user || !(await verifyPassword(user.passwordHash, parsed.data.currentPassword))) {
    await audit(req, "auth.password_change_failed", "user", req.user!.id);
    res.status(400).json({ error: "Your current password is not correct." });
    return;
  }
  const problem = passwordProblem(parsed.data.newPassword, user);
  if (problem) return badRequest(res, problem);
  if (await verifyPassword(user.passwordHash, parsed.data.newPassword)) return badRequest(res, "Choose a password you haven't used here before.");
  const [updated] = await db
    .update(usersTable)
    .set({ passwordHash: await hashPassword(parsed.data.newPassword), mustChangePassword: false, updatedAt: new Date() })
    .where(eq(usersTable.id, user.id))
    .returning();
  // Sign out every other device, then rotate this session.
  await revokeSessions(user.id);
  const csrf = await startSession(req, res, updated);
  await audit(req, "auth.password_changed", "user", user.id);
  res.json({ ...sessionPayload(updated, csrf), setupRequired: false, oauth: oauthStatus() });
});

export default router;
