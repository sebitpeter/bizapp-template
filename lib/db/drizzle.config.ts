import { defineConfig } from "drizzle-kit";
import fs from "fs";
import path from "path";

// Load the repo-root .env (if present) so `pnpm --filter @workspace/db run push`
// works locally on Windows/macOS/Linux without exporting variables by hand.
const rootEnv = path.join(__dirname, "..", "..", ".env");
if (!process.env.DATABASE_URL && fs.existsSync(rootEnv)) {
  process.loadEnvFile(rootEnv);
}

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env and fill it in, or provision a database.");
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
