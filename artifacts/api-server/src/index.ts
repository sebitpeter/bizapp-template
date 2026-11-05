import type { Server } from "node:http";
import { pool } from "@workspace/db";
import { runMigrations } from "@workspace/db/migrate";
import app from "./app";
import { env } from "./lib/env";
import { startJobs, stopJobs } from "./lib/jobs";
import { logger } from "./lib/logger";
import { closeRedis } from "./lib/rate-limit";
import { seedDatabase } from "./lib/seed";
import { bootstrapOwner } from "./lib/users";

const port = env.port;
if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
}

async function main() {
  // 1. Database schema (versioned SQL files in lib/db/migrations).
  if (env.runMigrations) {
    await runMigrations();
    logger.info("Database migrations are up to date");
  }
  // 2. First owner account from OWNER_* env vars (only when there are no accounts yet).
  await bootstrapOwner();
  // 3. Starter products/content (only into an empty database).
  try {
    await seedDatabase();
  } catch (seedError) {
    logger.error({ err: seedError }, "Unable to seed database");
  }

  const server: Server = app.listen(port, () => {
    logger.info({ port, publicUrl: env.publicUrl }, "Server listening");
  });
  startJobs();

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");
    stopJobs();
    server.close(async () => {
      await closeRedis();
      await pool.end().catch(() => undefined);
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((err) => {
  logger.error({ err }, "Start-up failed");
  process.exit(1);
});
