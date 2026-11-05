import crypto from "node:crypto";
import type { CookieOptions, NextFunction, Request, Response } from "express";
import { and, eq, ne, sql } from "drizzle-orm";
import { db, sessionsTable, usersTable, type Role, type User } from "@workspace/db";
import { env } from "./env";
import { can, permissionsFor, type Permission } from "./permissions";
import { safeEqual, sha256 } from "./password";

/**
 * Staff sessions (server-side).
 *
 *  - Cookie `sid` (or `__Host-sid` over HTTPS) holds 32 random bytes. The DB
 *    stores only sha256(token), so a database leak does not leak sessions.
 *  - httpOnly (JS can't read it), SameSite=Strict, Secure in production.
 *  - A new token is issued on every sign-in and password change (no fixation);
 *    sign-out deletes the row. Sessions end after SESSION_HOURS, or after
 *    SESSION_IDLE_MINUTES without activity.
 *  - CSRF: every session has its own random csrfToken. The browser gets it in
 *    the session JSON (and a readable XSRF-TOKEN cookie) and must echo it in
 *    the X-CSRF-Token header on every POST/PUT/PATCH/DELETE.
 */
export const SESSION_COOKIE = env.cookieSecure ? "__Host-sid" : "sid";
export const CSRF_COOKIE = "XSRF-TOKEN";
export const CSRF_HEADER = "x-csrf-token";

export type AuthUser = Pick<User, "id" | "username" | "email" | "name" | "role" | "mustChangePassword">;

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
      sessionId?: string;
      csrfToken?: string;
    }
  }
}

const baseCookie = (): CookieOptions => ({ secure: env.cookieSecure, sameSite: "strict", path: "/" });

export function publicUser(u: AuthUser) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    name: u.name,
    role: u.role as Role,
    mustChangePassword: u.mustChangePassword,
  };
}

export function sessionPayload(u: AuthUser, csrfToken: string) {
  return { authenticated: true as const, user: publicUser(u), permissions: permissionsFor(u.role as Role), csrfToken };
}

/** Creates a session row and sets the cookies. Call after the password (or OAuth) check succeeded. */
export async function startSession(req: Request, res: Response, user: AuthUser): Promise<string> {
  // Rotate: throw away the session this browser had before (if any).
  const old = req.cookies?.[SESSION_COOKIE];
  if (typeof old === "string" && old) await db.delete(sessionsTable).where(eq(sessionsTable.id, sha256(old)));

  const token = crypto.randomBytes(32).toString("base64url");
  const csrfToken = crypto.randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + env.sessionHours * 3600_000);
  await db.insert(sessionsTable).values({
    id: sha256(token),
    userId: user.id,
    csrfToken,
    expiresAt,
    ip: req.ip ?? null,
    userAgent: (req.get("user-agent") ?? "").slice(0, 300),
  });
  res.cookie(SESSION_COOKIE, token, { ...baseCookie(), httpOnly: true, expires: expiresAt });
  res.cookie(CSRF_COOKIE, csrfToken, { ...baseCookie(), httpOnly: false, expires: expiresAt });
  req.user = user;
  req.csrfToken = csrfToken;
  req.sessionId = sha256(token);
  return csrfToken;
}

export function clearSessionCookies(res: Response): void {
  res.clearCookie(SESSION_COOKIE, { ...baseCookie(), httpOnly: true });
  res.clearCookie(CSRF_COOKIE, { ...baseCookie(), httpOnly: false });
}

export async function endSession(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token === "string" && token) await db.delete(sessionsTable).where(eq(sessionsTable.id, sha256(token)));
  clearSessionCookies(res);
}

/** Sign a user out everywhere (optionally keeping one session). */
export async function revokeSessions(userId: number, exceptSessionId?: string): Promise<void> {
  await db
    .delete(sessionsTable)
    .where(exceptSessionId ? and(eq(sessionsTable.userId, userId), ne(sessionsTable.id, exceptSessionId)) : eq(sessionsTable.userId, userId));
}

export async function purgeExpiredSessions(): Promise<void> {
  const idleCutoff = new Date(Date.now() - env.sessionIdleMinutes * 60_000);
  await db.delete(sessionsTable).where(sql`${sessionsTable.expiresAt} < now() OR ${sessionsTable.lastSeenAt} < ${idleCutoff}`);
}

/** Looks up the session from the cookie. Returns null if missing/expired/idle/disabled. */
export async function loadSession(req: Request): Promise<{ user: AuthUser; sessionId: string; csrfToken: string } | null> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length < 20 || token.length > 100) return null;
  const id = sha256(token);
  const [row] = await db
    .select({ session: sessionsTable, user: usersTable })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(eq(sessionsTable.id, id));
  if (!row) return null;
  const now = Date.now();
  const idle = now - row.session.lastSeenAt.getTime() > env.sessionIdleMinutes * 60_000;
  if (row.session.expiresAt.getTime() <= now || idle || row.user.disabled) {
    await db.delete(sessionsTable).where(eq(sessionsTable.id, id));
    return null;
  }
  if (now - row.session.lastSeenAt.getTime() > 60_000) {
    await db.update(sessionsTable).set({ lastSeenAt: new Date() }).where(eq(sessionsTable.id, id));
  }
  return { user: row.user, sessionId: id, csrfToken: row.session.csrfToken };
}

const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Routes a user who must change their password can still use. */
const PASSWORD_CHANGE_ALLOWED = ["/auth/session", "/auth/logout", "/auth/change-password"];

/**
 * requireAuth()            – any signed-in staff member
 * requireAuth("users.manage") – also needs that permission (see permissions.ts)
 */
export function requireAuth(...needed: Permission[]) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await loadSession(req);
      if (!session) {
        clearSessionCookies(res);
        res.status(401).json({ error: "Please sign in" });
        return;
      }
      if (MUTATING.has(req.method)) {
        const sent = req.get(CSRF_HEADER) ?? "";
        if (!sent || !safeEqual(sent, session.csrfToken)) {
          res.status(403).json({ error: "Security check failed (CSRF). Reload the page and try again.", code: "CSRF" });
          return;
        }
      }
      req.user = session.user;
      req.sessionId = session.sessionId;
      req.csrfToken = session.csrfToken;
      if (session.user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.includes(req.path)) {
        res.status(403).json({ error: "Please choose a new password first", code: "PASSWORD_CHANGE_REQUIRED" });
        return;
      }
      for (const p of needed) {
        if (!can(session.user.role as Role, p)) {
          res.status(403).json({ error: "You don't have permission to do that", code: "FORBIDDEN" });
          return;
        }
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
