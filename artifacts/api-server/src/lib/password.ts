import crypto from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

/**
 * Passwords are hashed with Argon2id (OWASP-recommended parameters:
 * 19 MiB memory, 2 iterations, 1 lane). Plain passwords are never stored or logged.
 */
const OPTIONS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 200;

const COMMON = new Set([
  "password1234", "123456789012", "qwertyuiopas", "passwordpassword", "letmein12345", "adminadmin12",
  "welcome12345", "iloveyou1234", "changeme1234", "000000000000", "111111111111", "abc123abc123",
]);

export function hashPassword(plain: string): Promise<string> {
  return hash(plain, OPTIONS);
}

export async function verifyPassword(hashed: string, plain: string): Promise<boolean> {
  try {
    return await verify(hashed, plain);
  } catch {
    return false;
  }
}

/** A real hash of a random value: verifying against it takes the same time as a real check (no user-enumeration by timing). */
let dummy: Promise<string> | null = null;
export async function verifyDummy(plain: string): Promise<void> {
  dummy ??= hashPassword(crypto.randomBytes(16).toString("hex"));
  await verifyPassword(await dummy, plain);
}

/** Returns a problem description, or null if the password is acceptable. */
export function passwordProblem(plain: string, user?: { email?: string; username?: string }): string | null {
  if (typeof plain !== "string" || plain.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters`;
  if (plain.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters`;
  const lower = plain.toLowerCase();
  if (COMMON.has(lower) || /^(.)\1+$/.test(plain)) return "This password is too easy to guess";
  if (user?.email && lower.includes(user.email.split("@")[0].toLowerCase()) && user.email.split("@")[0].length >= 4) {
    return "Password must not contain your email name";
  }
  if (user?.username && user.username.length >= 4 && lower.includes(user.username.toLowerCase())) return "Password must not contain your username";
  return null;
}

/** Human-friendly one-time password, e.g. "kp7q-m2xf-9tzr-wd3h" (~80 bits). */
export function temporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const groups: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += alphabet[crypto.randomInt(alphabet.length)];
    groups.push(s);
  }
  return groups.join("-");
}

export const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) {
    crypto.timingSafeEqual(ab, ab);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}
