import path from "node:path";
import { logger } from "./logger";

/**
 * All environment variables the API reads, in one place.
 * See .env.example in the repo root (every variable is explained there),
 * SECURITY.md and DEPLOYMENT.md.
 *
 * Secrets (payment keys, SMTP password, OAuth secrets...) are ONLY read from
 * the environment — never from the database or the admin UI — so they can't
 * leak through a settings export or a stolen admin session.
 */
export const isProduction = process.env.NODE_ENV === "production";

function list(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
const str = (name: string) => (process.env[name] ?? "").trim();
const num = (name: string, fallback: number, min: number, max: number) => {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && process.env[name] !== "" && process.env[name] !== undefined ? Math.min(Math.max(n, min), max) : fallback;
};
const bool = (name: string, fallback: boolean) => {
  const v = str(name).toLowerCase();
  return v === "" ? fallback : v === "true" || v === "1" || v === "yes";
};

if (process.env.ADMIN_PASSWORD) {
  logger.warn(
    "ADMIN_PASSWORD is no longer used. Staff now have their own accounts — set OWNER_USERNAME/OWNER_EMAIL/OWNER_PASSWORD once (or use the /admin setup page), then remove ADMIN_PASSWORD.",
  );
}

/** Public base URL of the site, e.g. https://shop.example.com (used in payment redirects, emails, webhooks). */
let publicUrl = str("PUBLIC_URL").replace(/\/+$/, "");
if (publicUrl && !/^https?:\/\/[^\s/]+/.test(publicUrl)) {
  logger.error("PUBLIC_URL must look like https://shop.example.com — ignoring it.");
  publicUrl = "";
}
if (!publicUrl) {
  if (isProduction) logger.warn("PUBLIC_URL is not set. Online payments, OAuth sign-in and links in emails need it.");
  publicUrl = `http://localhost:${process.env.PORT ?? 8080}`;
}

const uploadStorage = str("UPLOAD_STORAGE").toLowerCase() === "disk" ? "disk" : "db";

export const env = {
  port: Number(process.env.PORT ?? 8080),
  publicUrl,
  /** Lifetime of a staff session (absolute). */
  sessionHours: num("SESSION_HOURS", 8, 1, 24 * 7),
  /** Sign out after this many minutes without activity. */
  sessionIdleMinutes: num("SESSION_IDLE_MINUTES", 60, 5, 24 * 60),
  /** Force the Secure flag on cookies. Defaults to on in production. */
  cookieSecure: process.env.COOKIE_SECURE ? bool("COOKIE_SECURE", isProduction) : isProduction,
  /** Failed sign-ins before an account is locked for LOGIN_LOCK_MINUTES. */
  loginMaxAttempts: num("LOGIN_MAX_ATTEMPTS", 5, 3, 50),
  loginLockMinutes: num("LOGIN_LOCK_MINUTES", 15, 1, 24 * 60),
  /** First owner account (created on start if there are no users yet). */
  owner: {
    username: str("OWNER_USERNAME"),
    email: str("OWNER_EMAIL").toLowerCase(),
    password: process.env.OWNER_PASSWORD ?? "",
    name: str("OWNER_NAME") || "Owner",
  },
  /** If set, the one-time /admin setup page asks for this token (always required in production). */
  setupToken: str("SETUP_TOKEN"),
  /** Extra origins allowed to call the API from a browser (comma separated). Same-origin needs nothing. */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** Express "trust proxy" setting. Replit/Render/Heroku sit behind ONE proxy → "1". */
  trustProxy: process.env.TRUST_PROXY ?? (isProduction ? "1" : "loopback"),
  uploadStorage: uploadStorage as "db" | "disk",
  /** Default: <repo root>/uploads. NOTE: on Replit/Render the disk can be wiped on redeploy. */
  uploadDir: path.resolve(process.env.UPLOAD_DIR ?? path.resolve(__dirname, "..", "..", "..", "uploads")),
  uploadMaxBytes: Math.min(Number(process.env.UPLOAD_MAX_MB ?? 2) || 2, 10) * 1024 * 1024,
  seedFile: process.env.SEED_FILE,
  seedOnStart: process.env.SEED_ON_START !== "false",
  runMigrations: process.env.RUN_MIGRATIONS !== "false",
  /** Serve the built storefront from this API (one service = simplest deploy). */
  staticDir: process.env.STATIC_DIR ?? path.resolve(__dirname, "..", "..", "storefront", "dist", "public"),
  serveStatic: bool("SERVE_STATIC", true),
  /** Optional shared rate-limit store for several instances. Without it limits are per process (memory). */
  redisUrl: str("REDIS_URL"),
  /** Unpaid online orders are cancelled (stock released) after this many minutes. */
  paymentTimeoutMinutes: num("PAYMENT_TIMEOUT_MINUTES", 60, 10, 7 * 24 * 60),
  /** Background job interval (re-check pending payments, expire old ones, purge sessions). */
  jobIntervalSeconds: num("JOB_INTERVAL_SECONDS", 300, 15, 3600),

  flutterwave: {
    secretKey: str("FLW_SECRET_KEY"),
    /** "Secret hash" you choose in Flutterwave dashboard → Settings → Webhooks. */
    webhookHash: str("FLW_SECRET_HASH"),
    paymentOptions: str("FLW_PAYMENT_OPTIONS"),
    /** Only honoured outside production (used by tests with the local fake Flutterwave). */
    apiBase: !isProduction && str("FLW_API_BASE") ? str("FLW_API_BASE").replace(/\/+$/, "") : "https://api.flutterwave.com/v3",
    fallbackEmail: str("FLW_FALLBACK_EMAIL").toLowerCase(),
  },
  pesapal: {
    consumerKey: str("PESAPAL_CONSUMER_KEY"),
    consumerSecret: str("PESAPAL_CONSUMER_SECRET"),
    live: str("PESAPAL_ENV").toLowerCase() === "live",
    ipnId: str("PESAPAL_IPN_ID"),
    apiBase:
      !isProduction && str("PESAPAL_API_BASE")
        ? str("PESAPAL_API_BASE").replace(/\/+$/, "")
        : str("PESAPAL_ENV").toLowerCase() === "live"
          ? "https://pay.pesapal.com/v3/api"
          : "https://cybqa.pesapal.com/pesapalv3/api",
  },

  smtp: {
    host: str("SMTP_HOST"),
    port: num("SMTP_PORT", 587, 1, 65535),
    secure: bool("SMTP_SECURE", false),
    user: str("SMTP_USER"),
    pass: process.env.SMTP_PASS ?? "",
    from: str("SMTP_FROM"),
  },
  sms: {
    /** Africa's Talking. Use username "sandbox" with a sandbox API key for testing. */
    username: str("AT_USERNAME"),
    apiKey: str("AT_API_KEY"),
    senderId: str("AT_SENDER_ID"),
  },
  notify: {
    shopEmail: str("NOTIFY_SHOP_EMAIL").toLowerCase(),
    shopPhone: str("NOTIFY_SHOP_PHONE"),
  },
  oauth: {
    google: { clientId: str("GOOGLE_CLIENT_ID"), clientSecret: str("GOOGLE_CLIENT_SECRET") },
    github: { clientId: str("GITHUB_CLIENT_ID"), clientSecret: str("GITHUB_CLIENT_SECRET") },
  },
};

if (isProduction && !env.cookieSecure) {
  logger.warn("COOKIE_SECURE=false in production: session cookies can be sent over plain http.");
}
