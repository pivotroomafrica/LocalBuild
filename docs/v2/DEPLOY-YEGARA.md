# Deploying Pivotroom to Yegara Premium (cPanel Node.js)

Status: **prepared, not yet verified on Yegara.** The standalone build was
built and booted locally (Linux, Node 22); nothing has been deployed to
Yegara. Do every step on a **staging subdomain** first and don't move the
production domain until section 7 passes.

## 0. Confirm before you start (ask Yegara support if unsure)

- [ ] cPanel → **Setup Node.js App** is available on the plan.
- [ ] Node **20.x or 22.x** can be selected (Next.js 16 needs ≥ 20.9).
- [ ] A free SSL certificate (AutoSSL / Let's Encrypt) can be issued for the subdomain.
- [ ] The plan's memory limit per app is at least **512 MB** (the app used about 110 MB idle locally; leave headroom).

If Node ≥ 20.9 isn't offered, **stop**: the app can't run there. Use the fallback in `AUDIT.md` §5.

## 1. Build on your own PC (never on the shared host)

```
git pull
npm ci
npm run build:standalone
```

This produces `.next/standalone/`, a self-contained folder with `server.js`,
the trimmed `node_modules` it needs, and the static assets. The host never has
to run `npm install` or `next build`.

> Build on the same major Node version you select in cPanel.

## 2. Upload

1. In cPanel → File Manager, create e.g. `~/pivotroom-app`.
2. Zip the **contents** of `.next/standalone/` (include the hidden `.next` folder inside it), upload, and extract into `~/pivotroom-app`. The folder should contain `server.js`, `package.json`, `node_modules/`, `.next/`.

## 3. Create the Node.js app

cPanel → **Setup Node.js App** → Create Application:

| Field | Value |
|---|---|
| Node.js version | 20.x or 22.x (same as your build) |
| Application mode | Production |
| Application root | `pivotroom-app` |
| Application URL | the staging subdomain |
| Application startup file | `server.js` |

Don't click "Run NPM Install"; dependencies are already bundled.

## 4. Environment variables

Add these in the same screen (**Environment variables**). Copy values from
your `.env.local`. **Never upload `.env.local` itself.**

| Variable | Notes |
|---|---|
| `NODE_ENV` | `production` |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | **secret** |
| `NEXT_PUBLIC_APP_URL` | the HTTPS URL of *this* deployment, no trailing slash |
| `CHAPA_MODE`, `CHAPA_SECRET_KEY`, `CHAPA_WEBHOOK_SECRET` | use Chapa **test** keys on staging |
| `RESEND_API_KEY`, `PIVOTROOM_EMAIL_FROM`, `PIVOTROOM_REPLY_TO`, `EMAIL_DELIVERY_ENABLED` | |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`, `GOOGLE_CALENDAR_ID` | if Calendar is used |
| `INTEGRATION_WORKER_SECRET`, `INTEGRATIONS_MODE` | |
| `PIVOTROOM_BANK_*` | manual transfer details |

`NEXT_PUBLIC_*` values are baked into the browser bundle **at build time**.
If you change them, rebuild (step 1) and re-upload.

Click **Restart**.

## 5. HTTPS, Supabase and Chapa callbacks

1. Issue SSL for the subdomain (cPanel → SSL/TLS Status → Run AutoSSL).
2. Supabase dashboard → Authentication → URL Configuration:
   - add `https://<staging-domain>/auth/callback` to **Redirect URLs**.
3. Chapa dashboard → webhook URL: `https://<staging-domain>/api/payments/chapa/webhook`.
4. Schedule the email/calendar worker: run `supabase/ops/schedule-integration-jobs.sql` with this deployment's URL and `INTEGRATION_WORKER_SECRET`.

## 6. Restart, logs, rollback

- **Restart:** Setup Node.js App → Restart (needed after any upload or env change).
- **Logs:** the app's stderr log in the application root (often `stderr.log`), plus cPanel → Metrics → Errors. Server errors from the app are printed as plain text (e.g. `getDirectoryForRequest: …`).
- **Rollback:** keep the previous release in `~/pivotroom-app-prev`. To roll back, swap the folder names and restart. Don't delete the old deployment until the new one has run cleanly for a while.

## 7. Staging checklist (all must pass before touching DNS)

- [ ] Home, Browse Experts, an expert profile and Become an Expert load over HTTPS.
- [ ] Sign up → confirmation email arrives → log in → log out.
- [ ] Password reset email arrives and works.
- [ ] Expert application: save profile, upload photo, submit.
- [ ] Admin: approve + publish → expert appears in the directory within seconds.
- [ ] Booking: pick slot → hold → intake → Chapa **test** payment → booking confirmed.
- [ ] Webhook: Chapa dashboard shows 200 responses for the staging URL.
- [ ] Confirmation emails sent (check `integration_jobs` rows move to `completed`).
- [ ] Manual bank transfer → admin verifies → confirmed.
- [ ] Cancel and reschedule from the dashboard.
- [ ] Memory stays within the plan limit under the load tests (`docs/v2/AUDIT.md` §6).

## 8. Production cut-over (only after staging passes)

1. Back up the database (`docs/v2/BACKUP.md`).
2. Repeat steps 1–6 for the production domain with **live** Chapa keys.
3. Smoke-test the production URL before switching DNS.
4. Switch DNS, monitor logs, and keep the previous deployment available for rollback.
