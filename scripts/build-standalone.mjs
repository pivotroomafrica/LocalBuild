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

// NEXT_PUBLIC_* values are baked into the build, so show which site and
// which Supabase project this build will talk to before spending time on it.
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd(), false);
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
console.log("\nBuilding Pivotroom for:");
console.log("  Website address: " + (appUrl || "(not set)"));
console.log("  Supabase project: " + (supabaseUrl || "(not set)"));
console.log("  Supabase public key starts with: " + (anonKey ? anonKey.slice(0, 22) + "..." : "(not set)") + "\n");
if (!appUrl || !supabaseUrl || !anonKey) {
  console.error("Stopped: set NEXT_PUBLIC_APP_URL (set NEXT_PUBLIC_APP_URL=https://...) and the two NEXT_PUBLIC_SUPABASE_ values in .env.local first.");
  process.exit(1);
}

const result = spawnSync(process.execPath, [nextBin, "build"], {
  stdio: "inherit",
  env: { ...process.env, NEXT_OUTPUT: "standalone" },
});
if (result.status !== 0) process.exit(result.status ?? 1);

// The minimal server serves these only if they are copied next to it.
cpSync(".next/static", ".next/standalone/.next/static", { recursive: true });
if (existsSync("public")) cpSync("public", ".next/standalone/public", { recursive: true });

console.log("\nStandalone build ready in .next/standalone (start with: node server.js)");
