import fs from "node:fs";
import path from "node:path";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { db } from "./index";

/**
 * Finds lib/db/migrations whether we run from source (tsx), from the bundled
 * API (artifacts/api-server/dist) or inside the Docker image.
 * Override with MIGRATIONS_DIR.
 */
export function findMigrationsDir(): string {
  const candidates = [
    process.env.MIGRATIONS_DIR,
    typeof __dirname !== "undefined" ? path.resolve(__dirname, "..", "..", "..", "lib", "db", "migrations") : undefined,
    typeof __dirname !== "undefined" ? path.resolve(__dirname, "..", "migrations") : undefined,
    path.resolve(process.cwd(), "lib", "db", "migrations"),
    path.resolve(process.cwd(), "..", "..", "lib", "db", "migrations"),
    path.resolve(process.cwd(), "migrations"),
  ].filter((p): p is string => Boolean(p));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, "meta", "_journal.json"))) return dir;
  }
  throw new Error(`Migrations folder not found. Tried: ${candidates.join(", ")}. Set MIGRATIONS_DIR.`);
}

/** Applies any pending SQL migrations (safe to call on every start; already-applied ones are skipped). */
export async function runMigrations(folder = findMigrationsDir()): Promise<string> {
  await migrate(db, { migrationsFolder: folder });
  return folder;
}
