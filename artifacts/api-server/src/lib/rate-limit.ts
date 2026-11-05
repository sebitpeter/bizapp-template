import { rateLimit, type Options } from "express-rate-limit";
import { RedisStore } from "rate-limit-redis";
import { createClient } from "redis";
import { env, isProduction } from "./env";
import { logger } from "./logger";

/**
 * Rate limiters. By default counts are kept in memory (fine for one server).
 * Set REDIS_URL to share them between several instances / survive restarts.
 * If Redis goes down, requests are let through (passOnStoreError) — the
 * per-account login lockout in the database still protects sign-in.
 */
type RedisClient = ReturnType<typeof createClient>;
let client: RedisClient | null = null;

if (env.redisUrl) {
  client = createClient({ url: env.redisUrl });
  client.on("error", (err) => logger.warn({ err: err.message }, "Redis error (rate limits fall back to allowing requests)"));
  client.connect().then(
    () => logger.info("Rate limits use Redis"),
    (err) => logger.error({ err: err.message }, "Could not connect to Redis"),
  );
}

export const rateLimitBackend = () => (client ? "redis" : "memory");

// Automated tests place many orders from one IP; RATE_LIMIT_SCALE (ignored in production) raises every limit.
const scale = !isProduction ? Math.max(1, Number(process.env.RATE_LIMIT_SCALE ?? 1) || 1) : 1;

export function limiter(name: string, options: Partial<Options>) {
  if (typeof options.limit === "number") options = { ...options, limit: options.limit * scale };
  return rateLimit({
    standardHeaders: "draft-8",
    legacyHeaders: false,
    passOnStoreError: true,
    ...(client ? { store: new RedisStore({ prefix: `rl:${name}:`, sendCommand: (...args: string[]) => client!.sendCommand(args) }) } : {}),
    ...options,
  });
}

export async function closeRedis(): Promise<void> {
  if (client?.isOpen) await client.quit().catch(() => undefined);
}
