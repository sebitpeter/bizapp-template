import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Copy .env.example to .env (local) or provision a database (Replit/Render).",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DATABASE_POOL_MAX ?? 10) });
export const db = drizzle(pool, { schema });

export * from "./schema";
