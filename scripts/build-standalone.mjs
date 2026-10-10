// Cross-platform (Windows/macOS/Linux) standalone build for shared hosting.
// Usage: npm run build:standalone
// Output: .next/standalone/ -- upload this folder's contents to the host
// and point cPanel's "Application startup file" at server.js.
// See docs/v2/DEPLOY-YEGARA.md.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "standalone" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The minimal server serves these only if they are copied next to it.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });

console.log("\nStandalone build ready in .next/standalone (start with: node server.js)");
