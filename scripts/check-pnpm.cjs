// Cross-platform replacement for the old `sh -c` preinstall script
// (that one failed on Windows PowerShell because `sh` is not installed there).
const fs = require("node:fs");
for (const f of ["package-lock.json", "yarn.lock"]) {
  try { fs.rmSync(f, { force: true }); } catch {}
}
const agent = process.env.npm_config_user_agent || "";
if (!agent.startsWith("pnpm/")) {
  console.error("Use pnpm instead (npm install -g pnpm, then pnpm install)");
  process.exit(1);
}
