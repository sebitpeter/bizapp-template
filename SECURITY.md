# Security notes

What protects the shop, and what **you** must do when you deploy it for a business.

## 1. Deploy checklist

1. Secrets go **only** in `.env` (your PC) or the host's Environment/Secrets
   panel. Never commit `.env`, paste keys into chats/issues, or screenshot them.
   `.env` and `.env.*` are in `.gitignore` and `.dockerignore`.
2. Set `NODE_ENV=production` and `PUBLIC_URL=https://…` (your real https address).
3. Create the owner: set `SETUP_TOKEN` (required in production) and open
   `/admin`, **or** set `OWNER_USERNAME`/`OWNER_EMAIL`/`OWNER_PASSWORD` once,
   start the app, then **delete `OWNER_PASSWORD`**.
4. Give every staff member their **own** account with the lowest role that works.
5. Use **test/sandbox** payment keys until a real test order works end to end,
   then switch to live keys. Use different keys and passwords for every client.
6. Turn on database backups (see DEPLOYMENT.md).
7. Run `pnpm audit` before each release (CI does it on every push).

## 2. Staff accounts

- **Passwords:** Argon2id (`@node-rs/argon2`, 19 MiB, t=2). Minimum 12
  characters, must not contain the username; checked against a small list of
  very common passwords. Never logged, never returned by the API.
- **Roles** (enforced on the server on every request; the UI only hides what
  you can't use): `staff` – orders; `manager` – + products/stock, website text,
  reviews, uploads, refunds; `owner` – + branding, payments, staff, activity
  log, newsletter. The last active owner can't be demoted or disabled.
- **First run:** the `/admin` setup page only works while there are no
  accounts, and asks for `SETUP_TOKEN` (always in production).
- **Sessions:** random 32-byte token in an httpOnly, `SameSite=Strict`,
  `Secure` (`__Host-` prefixed) cookie; the DB stores only its SHA-256.
  New token on every sign-in; ends after `SESSION_HOURS` (8) or
  `SESSION_IDLE_MINUTES` (60) idle. Disabling a user, changing their role or
  resetting their password signs them out everywhere.
- **CSRF:** every session has its own token; all POST/PUT/PATCH/DELETE from the
  admin must send it in `X-CSRF-Token` (plus SameSite=Strict and JSON-only bodies).
- **Lockout:** `LOGIN_MAX_ATTEMPTS` (5) wrong passwords lock the account for
  `LOGIN_LOCK_MINUTES` (15). A wrong username and a wrong password get the same message (a locked
  account does say it's locked, so lockout can confirm a username exists).
- **Password resets** by an owner set a temporary password and force the
  user to choose a new one at next sign-in.
- **Google / GitHub sign-in (optional):** only for **existing, active** staff
  whose *verified* email matches; uses `state` + PKCE (S256); nobody can sign
  up through it.
- **Activity log:** sign-ins, failed sign-ins, lockouts, staff changes,
  order status/payments/refunds, products, settings, review moderation.
  Never stores passwords, keys or tokens.

## 3. Payments

- The browser never sends prices: the server loads products, applies delivery
  fee/zone, minimum order and stock, and calculates the total.
- Stock is taken with one atomic conditional UPDATE inside the order transaction, so two
  customers can't buy the last item. Unpaid online orders are cancelled and
  their stock released after `PAYMENT_TIMEOUT_MINUTES`.
- A payment is marked paid **only** after the server asks the provider's API
  and the **amount, currency and reference** match. The "return" redirect and
  webhook bodies are never trusted on their own.
- **Flutterwave webhooks** must carry `verif-hash` = `FLW_SECRET_HASH`
  (constant-time compare) or get 401. **Pesapal IPNs** aren't signed by
  Pesapal, so the server always re-checks `GetTransactionStatus`.
- Webhooks are **idempotent** (each event processed once) and rate limited.
- Keys come only from environment variables. The admin page shows whether keys
  exist and if they're test or live — never the values. A method switched on
  without keys is hidden at checkout until the keys are added.
- Checkout redirects only to `http(s)` URLs returned by our own server.

## 4. Customer data and public endpoints

- Customers see an order only with its **code + phone number** (or the private
  token stored in their browser after checkout). Staff notes are never shown.
- Rate limits per IP: whole API 600/15 min; sign-in 10/15 min; orders
  10/10 min; tracking 30/15 min; pay 10/15 min; reviews 5/h; newsletter 10/h;
  webhooks 120/min. Set `REDIS_URL` to share limits between several instances.
- Honeypot fields on order, review and newsletter forms.
- Reviews appear only after a manager approves them. Newsletter sign-ups are
  de-duplicated; every email has a one-click unsubscribe link.

## 5. General hardening (kept from the first clean-up)

- Strict Zod validation on every body (unknown fields → 400), length limits,
  `https://` or own-media image URLs only.
- `helmet` headers, strict Content-Security-Policy on the site, no
  `x-powered-by`, CORS same-origin unless `CORS_ORIGINS` is set.
- JSON only, 100 kB body limit; errors never leak stack traces or SQL.
- Uploads: PNG/JPEG/WebP only (checked by magic bytes, SVG refused), random
  names, size limit, served with `nosniff` and a sandbox CSP. Replaced logos
  and product photos are deleted.
- Structured JSON logs (pino) without cookies, passwords or auth headers.

## 6. Environment variables

Every variable is explained in **`.env.example`**. Summary:

| Variable | Needed for | Default |
|---|---|---|
| `DATABASE_URL` | always | – |
| `PUBLIC_URL` | online payments, OAuth, email links | `http://localhost:PORT` |
| `NODE_ENV` | `production` when deployed | – |
| `SETUP_TOKEN` | first-run setup page (required in production) | – |
| `OWNER_USERNAME`, `OWNER_EMAIL`, `OWNER_PASSWORD`, `OWNER_NAME` | create the first owner from env | – |
| `FLW_SECRET_KEY`, `FLW_SECRET_HASH` | Flutterwave | off |
| `FLW_PAYMENT_OPTIONS`, `FLW_FALLBACK_EMAIL` | Flutterwave (optional) | provider default |
| `PESAPAL_CONSUMER_KEY`, `PESAPAL_CONSUMER_SECRET`, `PESAPAL_ENV` | Pesapal | off / `sandbox` |
| `PESAPAL_IPN_ID` | Pesapal (optional, auto-registered) | – |
| `PAYMENT_TIMEOUT_MINUTES`, `JOB_INTERVAL_SECONDS` | unpaid-order expiry, re-checks | 60, 300 |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | email | log only |
| `AT_USERNAME`, `AT_API_KEY`, `AT_SENDER_ID` | SMS (Africa's Talking) | log only |
| `NOTIFY_SHOP_EMAIL`, `NOTIFY_SHOP_PHONE` | new-order alerts to the shop | – |
| `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET` | optional staff OAuth | off |
| `SESSION_HOURS`, `SESSION_IDLE_MINUTES` | session length | 8, 60 |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | lockout | 5, 15 |
| `COOKIE_SECURE`, `TRUST_PROXY`, `CORS_ORIGINS` | network | prod: true, `1`, none |
| `REDIS_URL` | shared rate limits | memory |
| `UPLOAD_STORAGE`, `UPLOAD_DIR`, `UPLOAD_MAX_MB` | images | `db`, `./uploads`, 2 |
| `RUN_MIGRATIONS`, `SEED_FILE`, `SEED_ON_START`, `SERVE_STATIC`, `STATIC_DIR`, `MIGRATIONS_DIR`, `DATABASE_POOL_MAX`, `LOG_LEVEL`, `PORT` | operations | sensible defaults |

`ADMIN_PASSWORD` and `SESSION_SECRET` from the first version are **no longer
used** (the server warns if `ADMIN_PASSWORD` is still set).

## 7. Known limits

- Card/Mobile Money payments run on Flutterwave's or Pesapal's hosted page;
  this app never sees card numbers or PINs. Refunds are recorded in the admin
  but must be **sent** from the provider's dashboard (or by Mobile Money).
- No 2-factor authentication for staff yet (Google/GitHub sign-in can provide it).
- Without `REDIS_URL`, rate limits are per server process.
- Images are stored in Postgres by default; large catalogues may prefer object
  storage (not built in).

## 8. Check it yourself

```powershell
pnpm audit
pnpm run build
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/bizapp_test"; pnpm test
```
