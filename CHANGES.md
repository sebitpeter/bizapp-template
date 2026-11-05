# CHANGES — Bake&Bite → white-label shop template

The baseline is commit `c1f2a96` (the original Replit export). Every change is in git history: `git log`, `git diff c1f2a96`.

# Round 2 — a complete shop system (4 Nov 2026, EAT)

Commits `efe6620`, `0e59aff`, `1b2efd7`, `9e2d1de`. This round **replaces** the single
`ADMIN_PASSWORD` login from round 1 (`ADMIN_PASSWORD` and `SESSION_SECRET` are no longer used).

## Staff accounts and security
- Staff accounts with **owner / manager / staff** roles (permission map in `artifacts/api-server/src/lib/permissions.ts`).
  Staff: orders + mark paid. Manager: + refunds, products, website text, reviews, uploads. Owner: + branding, payments, staff, audit log, newsletter.
- Passwords hashed with **Argon2id**; 12–128 chars, common-password and "contains your username/email" checks.
- **First-run setup**: `OWNER_USERNAME/OWNER_EMAIL/OWNER_PASSWORD` env vars, or `/admin` with a `SETUP_TOKEN` (one-time, race-safe).
- Server-side **sessions** (`__Host-sid` cookie, only a SHA-256 of the token in the DB), 8 h max / 60 min idle; all of a user's sessions are revoked on password change/reset, role change or disable.
- **Lockout** after 5 failed logins (15 min) plus per-IP rate limit; **CSRF** double-submit token on every write.
- The last active owner can't be demoted or disabled.
- **Audit log** of staff actions (logins, orders, payments, products, settings, staff changes) with an owner-only viewer.
- **Lamp login page** (split card, lamp with cord + fireflies, light dims when typing the password), username or email.
- Optional **Google / GitHub sign-in** for existing staff only (state + PKCE, verified email must match); toast when not configured.

## Payments
- **Cash on delivery / pay at pickup**: staff mark paid.
- **Flutterwave** (MTN MoMo, Airtel Money, cards): hosted payment link → webhook checked with `verif-hash` (constant-time) → server re-verifies the transaction (amount, currency, reference) with Flutterwave's API. Idempotent via `webhook_events`.
- **Pesapal** (MoMo, Airtel, cards): OAuth token → IPN URL auto-registered → SubmitOrderRequest redirect → IPN + GetTransactionStatus verification.
- Amounts always computed on the server; keys only in env; admin shows "configured / missing" only.
- Unpaid online orders expire after `PAYMENT_TIMEOUT_MINUTES` and release stock; background job re-checks pending payments.
- Refunds are **recorded** (money is returned from the provider dashboard).

## Orders, delivery, stock
- Order codes + **order tracking page** (code + phone, or the secret link) with status timeline and "check again" for payments.
- **Delivery zones** with fees, free-delivery threshold, minimum order, **pickup** option, default phone country code (Uganda 256 by default, works for other countries).
- **Stock** per product (blank = unlimited) taken atomically on order, returned on cancel/expiry; "only N left"/"sold out" on the shop.

## Notifications, content, cleanup
- **SMTP email** and **Africa's Talking SMS** to customer and shop (console log when not configured).
- **Newsletter** sign-up (single opt-in) with unsubscribe link and owner CSV export (formula-injection safe).
- **Review moderation** (pending → approve/hide).
- Old uploaded images are deleted when replaced or when the product is deleted; expired sessions are cleaned by the job runner (every `JOB_INTERVAL_SECONDS`, 300).

## Ops
- SQL **migrations** (`lib/db/migrations`), applied on start (`RUN_MIGRATIONS`).
- `/api/healthz` and `/api/readyz`; JSON logs (pino) with secrets redacted; optional Redis rate-limit store.
- `Dockerfile` (multi-stage, non-root, healthcheck), `docker-compose.yml` (app + Postgres, optional Redis), `.github/workflows/ci.yml` (audit, build, tests on Postgres 17), `render.yaml` Blueprint.
- `packageManager: pnpm@10.34.6`, Node ≥ 22; dependency overrides so **`pnpm audit` (all deps) is clean**.

## Docs
- New **DEPLOYMENT.md** (Windows beginner: GitHub → Render or Replit or Docker, getting every key, backups, troubleshooting).
- README, SECURITY, REBRANDING, replit.md, `.env.example` rewritten for the new system.

## Verification (4 Nov 2026, EAT)
- `pnpm run typecheck` pass, `pnpm run build` pass, `pnpm audit`: no known vulnerabilities.
- `pnpm test`: **137 passed, 0 failed** (real Postgres; Flutterwave against a local fake API).
- Pesapal **real sandbox** tested up to the hosted payment page.
- Production-layout run (as in the Docker image): healthz/readyz OK, site served, seed loaded.
- Screenshots: `shots2/` (storefront 01–07, admin 10–19, login-*.png, login.mp4).
- **Not tested**: building the Docker image (no Docker here), real Render/Replit deploys, completing a sandbox payment end to end (needs a public URL for IPN/webhooks), real Flutterwave, SMTP, SMS and OAuth providers.

---

# Round 1 — security fixes and white-label template

> Note: fix #1 below (single `ADMIN_PASSWORD`) was replaced in round 2 by staff accounts.

## Security fixes (details are in SECURITY.md)
| # | Severity | Problem | Fix |
|---|---|---|---|
| 1 | Critical | Anyone could open /admin and call every admin API (create, edit or delete products, orders and content) | Added `ADMIN_PASSWORD` login. It sets an httpOnly, signed, SameSite=Strict session cookie. A `requireAdmin` middleware protects every write route and every admin read route. Logins are rate limited, and passwords are compared in constant time. |
| 2 | Critical | `GET /api/orders` let any visitor see every customer's name, phone and address (IDOR/PII leak) | Order listing, viewing and status updates now require admin. The public `POST /api/orders` returns only a minimal receipt. |
| 3 | High | The client sent the prices, so a buyer could pay 0.01 | The server looks up every product from the DB, checks that it is available, and calculates the line prices and total itself. |
| 4 | High | No input validation, plus mass assignment (`id`, `createdAt` and other fields were accepted from the body) | Every route uses strict Zod schemas with length, range, URL and enum limits. Only whitelisted fields are written. |
| 5 | Medium | No rate limiting | Added a global limiter plus stricter limits on login, orders, reviews, newsletter and uploads. |
| 6 | Medium | `CORS *` | Cross-origin requests are blocked by default. Allowed origins can be set in `CORS_ORIGINS`. |
| 7 | Medium | No security headers | Added helmet (CSP on the API, nosniff, frameguard, HSTS in production). The frontend build gets a CSP meta tag. `x-powered-by` is removed. |
| 8 | Medium | Stack traces and DB errors were sent to clients | A central error handler returns generic messages. Details are only logged. |
| 9 | Medium | No body size limits or content-type check | JSON is capped at 100 kB, and non-JSON writes get a 415. |
| 10 | Low | User text went straight into ILIKE wildcards (not SQL injection, because Drizzle parameterises queries) | `%`, `_` and `\` are escaped. |
| 11 | Low | The dashboard showed made-up numbers | It now uses real stats from the DB. |
| 12 | Low | Vulnerable transitive dependency (body-parser) | Fixed with a pnpm override. `pnpm audit --prod` is now clean. |
| 13 | Low | Scripts only ran on Linux/Replit (`export`, `rm -rf`) | Made cross-platform so they work in Windows PowerShell. |

## New features
- **Admin → Branding page:**
  - Upload a logo, favicon and hero image.
  - Five brand colours, with presets, a contrast check and a live preview.
  - Contact details, social links, opening hours, and currency/locale.
  - Category badges and SEO fields.
  - Save, discard, and "reset to defaults" buttons, plus a warning about unsaved changes.
- **Settings in the DB:** stored in the `site_settings` table. `business.config.ts` is used as the fallback.
- **Secure uploads:** `media` table (DB storage by default) or `UPLOAD_STORAGE=disk`.
  - Only PNG, JPEG, WebP and GIF are accepted, with a magic-byte check.
  - Max 2 MB. Admin only.
  - Files are served with nosniff and a sandbox CSP. SVG uploads are rejected.
- **Polished admin:** sidebar layout, toasts, confirmation dialogs, empty and loading states, and image fallbacks.
- **Other pages:** a branded 404 page, and the admin is lazy-loaded so the storefront bundle stays small.

## Template / white-label changes
- `lib/business/business.config.ts`: one file holds the name, colours, fonts, contact details, hours, SEO, currency and category badges. The frontend, `index.html` (via a Vite plugin), the favicon and the seed all read from it.
- `lib/db/seed/data.json`: swappable starter products, reviews and content.
- Bakery-specific names were made generic: `bakery-hero.png` → `hero.png`, theme vars → `--brand-*`, and similar renames.
- Removed the unused `mockup-sandbox` artifact, empty folders, and unused dependencies (framer-motion, react-icons, date-fns, @hookform/resolvers). Replit-only Vite plugins now load only on Replit.
- Added `.env.example`. `.env` is gitignored.
- Root scripts: `dev:api`, `dev:web`, `db:push`, `smoke`, `typecheck`, `build`. The seed runs automatically the first time the API starts against an empty database.
- New docs: README.md, REBRANDING.md (with a coffee-shop example), SECURITY.md. replit.md was updated.
- `scripts/smoke-test.mjs`: 63 end-to-end checks covering auth, IDOR, pricing, validation, uploads, settings and headers.

## Verification (4 Nov 2026, EAT)
- `pnpm run typecheck`: pass. `pnpm run build`: pass.
- `pnpm audit --prod`: no known vulnerabilities.
- Smoke test: 63 passed, 0 failed (see smoke-results.txt).
- Coffee-shop rebrand example: builds and seeds; screenshot is shots/17.
- 17 Playwright screenshots are in `shots/`.
