import crypto from "node:crypto";
import { env } from "./env";

/**
 * Optional "Sign in with Google / GitHub" for EXISTING staff.
 *  - Never creates accounts: the verified email from the provider must match an
 *    active staff account (owner adds staff first in Admin → Staff).
 *  - Uses `state` (anti-CSRF) and PKCE (S256) — both providers support it.
 *  - Disabled unless both CLIENT_ID and CLIENT_SECRET are set for that provider.
 */
export type OAuthProvider = "google" | "github";

export const oauthStatus = () => ({
  google: Boolean(env.oauth.google.clientId && env.oauth.google.clientSecret),
  github: Boolean(env.oauth.github.clientId && env.oauth.github.clientSecret),
});

export const isOAuthProvider = (p: string): p is OAuthProvider => p === "google" || p === "github";

export const redirectUri = (p: OAuthProvider) => `${env.publicUrl}/api/auth/oauth/${p}/callback`;

export function newPkce() {
  const state = crypto.randomBytes(24).toString("base64url");
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function authorizeUrl(p: OAuthProvider, state: string, challenge: string): string {
  if (p === "google") {
    const q = new URLSearchParams({
      client_id: env.oauth.google.clientId,
      redirect_uri: redirectUri(p),
      response_type: "code",
      scope: "openid email",
      state,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
  }
  const q = new URLSearchParams({
    client_id: env.oauth.github.clientId,
    redirect_uri: redirectUri(p),
    scope: "user:email",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    allow_signup: "false",
  });
  return `https://github.com/login/oauth/authorize?${q}`;
}

async function json(res: globalThis.Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/** Exchanges the code and returns the provider's VERIFIED email addresses (lower-case). */
export async function verifiedEmails(p: OAuthProvider, code: string, verifier: string): Promise<string[]> {
  const signal = AbortSignal.timeout(10_000);
  if (p === "google") {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: env.oauth.google.clientId,
        client_secret: env.oauth.google.clientSecret,
        redirect_uri: redirectUri(p),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal,
    });
    const token = await json(tokenRes);
    if (!tokenRes.ok || typeof token.access_token !== "string") throw new Error("Google token exchange failed");
    const infoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${token.access_token}` }, signal });
    const info = await json(infoRes);
    if (!infoRes.ok) throw new Error("Google userinfo failed");
    return info.email_verified === true && typeof info.email === "string" ? [info.email.toLowerCase()] : [];
  }
  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      client_id: env.oauth.github.clientId,
      client_secret: env.oauth.github.clientSecret,
      code,
      redirect_uri: redirectUri(p),
      code_verifier: verifier,
    }),
    signal,
  });
  const token = await json(tokenRes);
  if (!tokenRes.ok || typeof token.access_token !== "string") throw new Error("GitHub token exchange failed");
  const emailsRes = await fetch("https://api.github.com/user/emails", {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: "application/vnd.github+json", "User-Agent": "bizapp-login" },
    signal,
  });
  const emails = await json(emailsRes);
  if (!emailsRes.ok || !Array.isArray(emails)) throw new Error("GitHub emails failed");
  return emails.filter((e: any) => e?.verified === true && typeof e.email === "string").map((e: any) => String(e.email).toLowerCase());
}
