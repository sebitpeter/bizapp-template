#!/usr/bin/env node
/**
 * One command to test everything end-to-end against a real Postgres:
 *
 *   1. wipes the TEST database (never point this at real data!)
 *   2. starts a fake Flutterwave on a free port
 *   3. starts the built API server (migrations run on start)
 *   4. runs scripts/smoke-test.mjs against it, then stops everything
 *
 *   pnpm run build            (once, builds artifacts/api-server/dist)
 *   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/bizapp_test pnpm test
 *
 * Windows PowerShell:
 *   $env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/bizapp_test"; pnpm test
 */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startFakeFlutterwave } from "./fake-flutterwave.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dbUrl = process.env.TEST_DATABASE_URL;
if (!dbUrl) {
  console.error("Set TEST_DATABASE_URL to an EMPTY database used only for tests (it is wiped).");
  process.exit(2);
}
if (!/test/i.test(new URL(dbUrl).pathname)) {
  console.error("Refusing to wipe a database whose name doesn't contain 'test'.");
  process.exit(2);
}

const requireFromDb = createRequire(path.join(root, "lib", "db", "package.json"));
const pg = requireFromDb("pg");

async function freePort() {
  return new Promise((resolve) => {
    const s = net.createServer().listen(0, "127.0.0.1", () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}

// 1. clean database
{
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  await client.query("DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;");
  await client.end();
  console.log("• test database wiped");
}

// 2. fake Flutterwave
const apiPort = await freePort();
const apiUrl = `http://127.0.0.1:${apiPort}`;
const FLW = { key: "FLWSECK_TEST-local-fake", hash: "local-fake-webhook-hash" };
const fake = await startFakeFlutterwave({ port: 0, secretKey: FLW.key, webhookHash: FLW.hash, webhookUrl: `${apiUrl}/api/payments/webhook/flutterwave` });
console.log(`• fake Flutterwave on port ${fake.port}`);

// 3. API server
const owner = { username: "owner", email: "owner@test.local", password: "Correct-Horse-Battery-77" };
const env = {
  ...process.env,
  NODE_ENV: "test",
  PORT: String(apiPort),
  DATABASE_URL: dbUrl,
  PUBLIC_URL: apiUrl,
  RUN_MIGRATIONS: "true",
  SERVE_STATIC: "false",
  OWNER_USERNAME: owner.username,
  OWNER_EMAIL: owner.email,
  OWNER_PASSWORD: owner.password,
  OWNER_NAME: "Test Owner",
  SETUP_TOKEN: "",
  LOGIN_MAX_ATTEMPTS: "3",
  LOGIN_LOCK_MINUTES: "5",
  RATE_LIMIT_SCALE: "20",
  JOB_INTERVAL_SECONDS: "3600",
  FLW_API_BASE: `http://127.0.0.1:${fake.port}/v3`,
  FLW_SECRET_KEY: FLW.key,
  FLW_SECRET_HASH: FLW.hash,
  PESAPAL_CONSUMER_KEY: "",
  PESAPAL_CONSUMER_SECRET: "",
  GOOGLE_CLIENT_ID: "",
  GITHUB_CLIENT_ID: "",
  SMTP_HOST: "",
  AT_API_KEY: "",
  REDIS_URL: "",
  UPLOAD_STORAGE: "database",
  LOG_LEVEL: process.env.LOG_LEVEL ?? "warn",
};
const api = spawn(process.execPath, ["--enable-source-maps", path.join(root, "artifacts", "api-server", "dist", "index.mjs")], { env, stdio: ["ignore", "inherit", "inherit"] });
let apiExited = false;
api.on("exit", (code) => {
  apiExited = true;
  if (code) console.error(`API server exited with code ${code}`);
});

async function waitReady() {
  for (let i = 0; i < 60; i++) {
    if (apiExited) return false;
    try {
      const r = await fetch(`${apiUrl}/api/readyz`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

let code = 1;
try {
  if (!(await waitReady())) throw new Error("API server did not become ready (did you run `pnpm run build`?)");
  console.log(`• API ready on ${apiUrl}\n`);
  code = await new Promise((resolve) => {
    const t = spawn(process.execPath, [path.join(root, "scripts", "smoke-test.mjs")], {
      env: { ...process.env, API_URL: apiUrl, OWNER_USERNAME: owner.username, OWNER_EMAIL: owner.email, OWNER_PASSWORD: owner.password, FAKE_FLW_URL: `http://127.0.0.1:${fake.port}`, FLW_SECRET_HASH: FLW.hash, LOGIN_MAX_ATTEMPTS: "3" },
      stdio: "inherit",
    });
    t.on("exit", (c) => resolve(c ?? 1));
  });
} catch (err) {
  console.error(String(err?.message ?? err));
} finally {
  api.kill("SIGTERM");
  fake.server.close();
}
process.exit(code);
