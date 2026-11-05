# White-label shop (currently branded: Bake&Bite)

Storefront + staff admin (owner/manager/staff roles) with COD, Flutterwave and Pesapal payments, order tracking,
reviews and newsletter; rebrandable for any business. See README.md, DEPLOYMENT.md, REBRANDING.md and SECURITY.md.

## Run & Operate

- `pnpm dev:api` (API, port 8080) and `pnpm dev:web` (site, port 5173; /api is proxied)
- `pnpm run typecheck` / `pnpm run build`
- Migrations: SQL files in `lib/db/migrations`, applied automatically on API start (`pnpm db:generate` after schema changes)
- `pnpm test` (137 end-to-end checks; needs `TEST_DATABASE_URL` pointing at a DB whose name contains `test`)
- `pnpm --filter @workspace/api-spec run codegen` (regenerate hooks after OpenAPI changes)
- Env: `DATABASE_URL`, `PUBLIC_URL`, `SETUP_TOKEN` (first-run owner setup) and optional payment/SMS/SMTP/OAuth keys — all in Secrets. Full list in `.env.example` and SECURITY.md.
- Deploy: build `pnpm install --frozen-lockfile && pnpm run build`, run `node --enable-source-maps artifacts/api-server/dist/index.mjs` (serves the site too). Health: `/api/healthz`, `/api/readyz`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, helmet, express-rate-limit (optional Redis store), server-side sessions, Argon2id, CSRF tokens, pino JSON logs
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod 4; API codegen: Orval
- Web: React 19, Vite 7, Tailwind 4, shadcn/ui, wouter, TanStack Query

## Where things live

- `business/`: the business config (defaults, wording, fonts) and the seed data. This is the only place to edit when rebranding in code.
- `artifacts/storefront`: the shop (`src/storefront`) and the admin (`src/admin`).
- `artifacts/api-server/src/routes`: auth, oauth, users, orders, payments, products, reviews, newsletter (audit log lives in users), content, dashboard, settings, media, health.
- `artifacts/api-server/src/lib/payments`: Flutterwave + Pesapal providers; `lib/permissions.ts`: role → permission map.
- `lib/db/src/schema`: tables (products, orders, order history, payments, webhook events, users, sessions, audit log, reviews, newsletter, content_entries, site_settings, media).
- `lib/api-spec/openapi.yaml`: the API contract.

## Architecture decisions

- Branding settings live in the `site_settings` table and fall back to `business/business.config.ts`. GET is public; PUT/DELETE need the owner permission `settings.branding`. The storefront applies them at runtime through CSS variables.
- The whole theme derives from 5 brand colours (`--brand-*`) via `color-mix` in `index.css`.
- Order totals are always computed on the server from DB prices; payments are confirmed only by server-side verification with the provider.
- Payment/SMTP/SMS/OAuth secrets are env-only; the admin UI only shows whether they're present.
- Uploaded images are stored in Postgres by default (deploy disks are ephemeral).

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After changing `business/business.config.ts`, rebuild the web app (index.html meta is generated at build time).
- Keep `lib/api-spec/openapi.yaml` and generated API clients in sync by running `pnpm --filter @workspace/api-spec run codegen` after contract changes.
- The generated validation package uses Zod 4 helpers, so the workspace catalog intentionally resolves `zod` to the 4.x line.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
