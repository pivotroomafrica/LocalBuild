import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Opt-in self-contained build for shared hosting (cPanel "Setup Node.js
  // App" on Yegara): `npm run build:standalone` emits .next/standalone with
  // its own server.js and only the node_modules it needs, so the host never
  // has to run `npm install` or `next build` itself. Plain `next build` /
  // `next start` / `next dev` are unaffected. See docs/v2/DEPLOY-YEGARA.md.
  output: process.env.NEXT_OUTPUT === "standalone" ? "standalone" : undefined,

  // Lets `next dev`'s HMR websocket connect when the app is reached through
  // a local tunnel (ngrok, Cloudflare Tunnel, etc.) rather than
  // localhost directly -- needed for testing provider webhooks (e.g.
  // Chapa, see README.md's Phase 8 section) that require a public URL.
  // Without this, Next.js blocks the cross-origin /_next/hmr request and
  // the dev client's failed reconnect loop can interfere with page
  // interactivity. Harmless in production (next build/start don't use HMR).
  allowedDevOrigins: ["*.ngrok-free.app", "*.ngrok-free.dev", "*.ngrok.io", "*.ngrok.app"],
};

export default nextConfig;
