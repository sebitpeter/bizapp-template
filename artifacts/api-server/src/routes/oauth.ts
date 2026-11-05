import { Router, type IRouter, type Response } from "express";
import { eq, inArray, sql } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { audit } from "../lib/audit";
import { startSession } from "../lib/auth";
import { env } from "../lib/env";
import { authorizeUrl, isOAuthProvider, newPkce, oauthStatus, verifiedEmails } from "../lib/oauth";
import { safeEqual } from "../lib/password";
import { limiter } from "../lib/rate-limit";

const router: IRouter = Router();
const STATE_COOKIE = "oauth_state";
const oauthLimiter = limiter("oauth", { windowMs: 15 * 60 * 1000, limit: 30, message: { error: "Too many attempts. Please wait." } });

const fail = (res: Response, code: string) => res.redirect(303, `/admin?login_error=${encodeURIComponent(code)}`);

router.get("/auth/oauth/:provider/start", oauthLimiter, (req, res): void => {
  const p = String(req.params.provider);
  if (!isOAuthProvider(p) || !oauthStatus()[p]) {
    res.status(404).json({ error: `${p === "github" ? "GitHub" : "Google"} sign-in isn't set up yet` });
    return;
  }
  const { state, verifier, challenge } = newPkce();
  // Lax (not Strict): the provider redirects back with a top-level GET from another site.
  res.cookie(STATE_COOKIE, JSON.stringify({ p, state, verifier }), {
    httpOnly: true,
    secure: env.cookieSecure,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/oauth",
  });
  res.redirect(302, authorizeUrl(p, state, challenge));
});

router.get("/auth/oauth/:provider/callback", oauthLimiter, async (req, res): Promise<void> => {
  const p = String(req.params.provider);
  const raw = req.cookies?.[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { httpOnly: true, secure: env.cookieSecure, sameSite: "lax", path: "/api/auth/oauth" });
  if (!isOAuthProvider(p) || !oauthStatus()[p]) return fail(res, "oauth_disabled");
  let saved: { p?: string; state?: string; verifier?: string } = {};
  try {
    saved = JSON.parse(typeof raw === "string" ? raw : "{}");
  } catch {
    /* ignore */
  }
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!saved.state || !saved.verifier || saved.p !== p || !state || !safeEqual(state, saved.state) || !code) {
    await audit(req, "auth.oauth_failed", "user", null, { provider: p, reason: "state" });
    return fail(res, "oauth_state");
  }
  let emails: string[];
  try {
    emails = await verifiedEmails(p, code, saved.verifier);
  } catch (err) {
    req.log.warn({ err: (err as Error).message, provider: p }, "OAuth exchange failed");
    return fail(res, "oauth_failed");
  }
  const candidates = emails.length
    ? await db.select().from(usersTable).where(inArray(sql`lower(${usersTable.email})`, emails))
    : [];
  const user = candidates.find((u) => !u.disabled && !(u.lockedUntil && u.lockedUntil > new Date()));
  if (!user) {
    await audit(req, "auth.oauth_failed", "user", null, { provider: p, reason: "no matching active account" });
    return fail(res, "oauth_no_account");
  }
  await db.update(usersTable).set({ lastLoginAt: new Date(), failedLogins: 0 }).where(eq(usersTable.id, user.id));
  await startSession(req, res, user);
  await audit(req, "auth.login", "user", user.id, { method: p }, { id: user.id, email: user.email });
  res.redirect(303, "/admin");
});

export default router;
