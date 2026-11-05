import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { env } from "./lib/env";
import { limiter } from "./lib/rate-limit";

declare module "http" {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

const app: Express = express();

// Needed so rate limiting sees the real visitor IP behind Replit/Render's proxy.
const trust = env.trustProxy;
app.set("trust proxy", /^\d+$/.test(trust) ? Number(trust) : trust === "true" ? true : trust === "false" ? false : trust);
app.disable("x-powered-by");

// Structured JSON logs (pretty in development) with a request id on every line.
// The id is returned in X-Request-Id so a customer's error can be found in the logs.
app.use(
  pinoHttp({
    logger,
    genReqId: (req, res) => {
      const incoming = req.headers["x-request-id"];
      const id = typeof incoming === "string" && /^[\w-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
      res.setHeader("X-Request-Id", id);
      return id;
    },
    autoLogging: { ignore: (req) => req.url === "/api/healthz" || req.url?.startsWith("/assets/") === true },
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// API: strictest headers (it only returns JSON and images).
app.use(
  "/api",
  helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "same-site" },
  }),
);

// CORS: same-origin needs nothing. Only origins listed in CORS_ORIGINS may call the API cross-site.
app.use(
  "/api",
  cors({
    origin: (origin, cb) => cb(null, !origin ? false : env.corsOrigins.includes(origin)),
    credentials: true,
  }),
);

// General rate limit (per IP). Images and health checks are excluded.
app.use(
  "/api",
  limiter("api", {
    windowMs: 15 * 60 * 1000,
    limit: 600,
    skip: (req) => (req.method === "GET" && (req.path.startsWith("/media/") || req.path === "/healthz" || req.path === "/readyz")) || req.path.startsWith("/payments/webhook/"),
    message: { error: "Too many requests, slow down." },
  }),
);

const isWebhook = (req: Request) => req.path.startsWith("/payments/webhook/");
const MUTATING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// CSRF layer 1: a browser always sends Origin on cross-site POST/PUT/PATCH/DELETE.
// Reject anything not from this site (or an allowed CORS origin). Webhooks are
// server-to-server and have their own checks.
const ownOrigin = (() => {
  try {
    return new URL(env.publicUrl).origin;
  } catch {
    return "";
  }
})();
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  if (!MUTATING.has(req.method) || isWebhook(req)) return next();
  const origin = req.get("origin");
  if (!origin) return next(); // non-browser clients (curl, tests); session routes still need the CSRF token
  const sameHost = (() => {
    try {
      return new URL(origin).host === req.get("host");
    } catch {
      return false;
    }
  })();
  if (sameHost || origin === ownOrigin || env.corsOrigins.includes(origin)) return next();
  res.status(403).json({ error: "Cross-site request blocked", code: "BAD_ORIGIN" });
});

// CSRF layer 2: JSON only. Browsers can't send application/json cross-site without a CORS preflight.
app.use("/api", (req: Request, res: Response, next: NextFunction) => {
  const hasBody = Number(req.get("content-length") ?? 0) > 0 || req.get("transfer-encoding") !== undefined;
  if (MUTATING.has(req.method) && hasBody && !req.path.startsWith("/admin/uploads") && !isWebhook(req) && !req.is("application/json")) {
    res.status(415).json({ error: "Content-Type must be application/json" });
    return;
  }
  next();
});

// Keep the exact bytes for webhook signature checks.
app.use(
  express.json({
    limit: "100kb",
    verify: (req, _res, buf) => {
      if ((req as Request).originalUrl?.startsWith("/api/payments/webhook/")) req.rawBody = Buffer.from(buf);
    },
  }),
);
app.use("/api/payments/webhook", express.urlencoded({ extended: false, limit: "20kb" }));
app.use(cookieParser());

app.use("/api", router);

app.use("/api", (_req: Request, res: Response) => {
  res.status(404).json({ error: "Not found" });
});

// Optional: serve the built storefront + admin from the same server (one service on Render/Docker).
if (env.serveStatic && fs.existsSync(path.join(env.staticDir, "index.html"))) {
  const indexHtml = path.join(env.staticDir, "index.html");
  const siteHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        connectSrc: ["'self'"],
        frameSrc: ["'self'", "https://www.google.com", "https://maps.google.com"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: env.cookieSecure ? [] : null,
      },
    },
  });
  app.use(siteHelmet);
  app.use(express.static(env.staticDir, { index: false, maxAge: "1h", setHeaders: (res, file) => {
    if (file.includes(`${path.sep}assets${path.sep}`)) res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
  } }));
  app.get(/^(?!\/api\/).*/, (_req: Request, res: Response) => {
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
  logger.info({ dir: env.staticDir }, "Serving the website from the API server");
}

// Never leak stack traces or SQL errors to the browser; log them server-side instead.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const e = err as { type?: string; status?: number; statusCode?: number };
  if (e?.type === "entity.too.large") {
    res.status(413).json({ error: "Request body too large" });
    return;
  }
  if (e?.type === "entity.parse.failed") {
    res.status(400).json({ error: "Malformed JSON" });
    return;
  }
  const status = e?.status ?? e?.statusCode;
  if (status && status >= 400 && status < 500) {
    res.status(status).json({ error: "Bad request" });
    return;
  }
  req.log?.error({ err }, "Unhandled error");
  res.status(500).json({ error: "Internal server error", requestId: req.id });
});

export default app;
