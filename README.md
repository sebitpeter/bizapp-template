# White-label shop (storefront + staff admin)

A complete small-business online shop you can rebrand for any business
(bakery, coffee shop, florist, restaurant, salon…). Built for **Uganda first**
(UGX, +256 phone numbers, MTN MoMo / Airtel Money) but works in any country
and currency.

**Customers (`/`)**
- Products with search, categories, stock ("Only 3 left", "Sold out"), basket.
- Checkout: delivery (zones with fees, free-delivery threshold, minimum order)
  or pickup; pay **cash on delivery**, or online with **Flutterwave** or
  **Pesapal** (Mobile Money + cards). Prices are always calculated by the server.
- Order confirmation page and **order tracking** (`/track`, code + phone).
- Reviews (moderated before they show), newsletter sign-up with unsubscribe links.
- Email (SMTP) and SMS (Africa's Talking) notifications.

**Staff (`/admin`)** — the "lamp" sign-in page, then:
- **Dashboard**, **Orders** (status, mark paid, record refund, history),
  **Products** (photos, stock), **Reviews** (approve/hide), **Website text**,
  **Newsletter** (CSV export) — depending on role.
- Owner only: **Branding** (logo, colours, contact, currency, SEO),
  **Payments & delivery**, **Staff** accounts and roles, **Activity log**.
- Roles: **staff** (orders), **manager** (+ products, text, reviews, refunds),
  **owner** (everything). Passwords are hashed with Argon2id.

Stack: React 19 + Vite + Tailwind (shadcn/ui) · Express 5 · PostgreSQL + Drizzle
· pnpm monorepo · Node 24.

## Quick start on your own PC (Windows PowerShell)

You need **Node.js 24** (nodejs.org), **pnpm** (`npm install -g pnpm`) and a
**PostgreSQL** database (install PostgreSQL locally, or a free one from Neon/Supabase).

```powershell
pnpm install
Copy-Item .env.example .env   # open .env in Notepad: set DATABASE_URL, OWNER_* (or SETUP_TOKEN)
pnpm dev:api                  # terminal 1: API on http://localhost:8080 (creates tables + starter data)
pnpm dev:web                  # terminal 2: website on http://localhost:5173
```

Open <http://localhost:5173> for the shop and <http://localhost:5173/admin> for
staff. Sign in with the `OWNER_USERNAME`/`OWNER_EMAIL`/`OWNER_PASSWORD` you put
in `.env` (then delete `OWNER_PASSWORD` from `.env`), or leave those empty and
create the owner on the `/admin` setup page.

To put it online, follow **[DEPLOYMENT.md](DEPLOYMENT.md)** (Render or Replit,
step by step).

## Commands

| Command | What it does |
|---|---|
| `pnpm run typecheck` | Check all TypeScript |
| `pnpm run build` | Typecheck + production build (API bundle + website) |
| `pnpm test` | 137 end-to-end API checks against a throw-away test database (see below) |
| `pnpm audit` | Check dependencies for known vulnerabilities |
| `pnpm db:generate` | Create a new SQL migration after changing `lib/db/src/schema` |
| `pnpm db:migrate` | Apply migrations (the API also does this on start) |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate API hooks after editing `lib/api-spec/openapi.yaml` |
| `docker compose up --build` | Run app + Postgres in Docker (see `docker-compose.yml`) |

Running the tests (the database name **must contain "test"**; it is wiped):

```powershell
$env:TEST_DATABASE_URL="postgres://postgres:postgres@localhost:5432/bizapp_test"
pnpm run build; pnpm test
```

The tests start a local *fake* Flutterwave, so they never touch real payment APIs.

## Where things are

```
business/                     ← EDIT THIS to rebrand (see REBRANDING.md)
  business.config.ts            name, colours, contact, all website wording, fonts
  seed/data.json                starter products, reviews, text
  examples/coffee-shop/         full example of another business
artifacts/storefront/         ← the website (React)
  src/storefront/               shop page, checkout, order/track pages, reviews
  src/admin/                    admin pages (orders, products, staff, payments, audit…)
  src/admin/lamp-login.*        the animated sign-in page
artifacts/api-server/         ← the API (Express)
  src/routes/                   auth, oauth, users, orders, payments, products, reviews, newsletter…
  src/lib/payments/             flutterwave.ts, pesapal.ts (+ cash on delivery)
  src/lib/                      env vars, sessions, permissions, notifications, jobs
lib/db/                       ← tables (src/schema) and SQL migrations (migrations/)
lib/api-spec/openapi.yaml     ← API contract (hooks in lib/api-client-react are generated)
scripts/                      ← tests (run-tests.mjs, smoke-test.mjs, fake-flutterwave.mjs)
Dockerfile, docker-compose.yml, render.yaml, .github/workflows/ci.yml
```

## Docs

- **[DEPLOYMENT.md](DEPLOYMENT.md)** — put it online (Render / Replit), get payment, SMS, email and Google/GitHub keys, backups.
- **[REBRANDING.md](REBRANDING.md)** — turn this into a shop for another business.
- **[SECURITY.md](SECURITY.md)** — how accounts, payments and data are protected; all environment variables.
- **[CHANGES.md](CHANGES.md)** — what changed.
