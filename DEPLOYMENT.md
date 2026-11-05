# Putting the shop online (step by step, for Windows)

This guide assumes you've never deployed a website before. You will:

1. put the code in **your own private GitHub repository**,
2. create the website + database on **Render** (Option A) or **Replit** (Option B),
3. paste your **secret keys** into the host's settings (never into the code),
4. create the owner account and test an order.

> **Golden rule:** keys and passwords live only in `.env` on your PC or in the
> host's *Environment / Secrets* panel. Never commit them, never paste them in
> a chat, never put them in a screenshot.

---

## 0. One-time setup on your PC

1. Install **Git** (git-scm.com → Download for Windows → keep the defaults).
2. Install **Node.js 24 LTS** (nodejs.org).
3. Open **PowerShell** and run:
   ```powershell
   npm install -g pnpm
   git config --global user.name "Your Name"
   git config --global user.email "you@example.com"
   ```
4. Unzip the project, then in PowerShell go into the folder:
   ```powershell
   cd $HOME\Downloads\bizapp-template
   pnpm install
   pnpm run build        # must finish without errors
   ```

## 1. Put the code on GitHub (private)

1. github.com → **New repository** → name it (e.g. `my-shop`) → **Private** →
   *don't* add a README → **Create**.
2. In PowerShell, in the project folder:
   ```powershell
   git init
   git add .
   git status            # check that .env is NOT in the list
   git commit -m "My shop"
   git branch -M main
   git remote add origin https://github.com/YOUR-NAME/my-shop.git
   git push -u origin main
   ```
   (Git opens a browser window to sign in to GitHub the first time.)

---

## Option A: Render (recommended)

The repo contains `render.yaml`, a "Blueprint" that creates the database and the
web service for you.

1. render.com → sign up with GitHub.
2. **New → Blueprint** → choose your `my-shop` repo → **Apply**.
   Render creates `bizapp-db` (Postgres) and `bizapp` (the website).
3. Render asks for the values marked *sync: false*. For now fill only:
   - `PUBLIC_URL` = the address Render shows for the service, e.g.
     `https://bizapp-xxxx.onrender.com` (no `/` at the end). You can edit it
     later under **bizapp → Environment**.
   Leave payment/SMS/email keys empty for now — those features stay off.
4. Wait for the first deploy (5–10 min). **Logs** should end with
   `Server listening`. Open `https://…onrender.com/api/readyz` → `{"status":"ready"}`.
5. **Create the owner:** bizapp → **Environment** → copy the generated
   `SETUP_TOKEN`. Open `https://…onrender.com/admin`, fill in your name,
   username, email, a 12+ character password and the setup token.
6. Sign in, go to **Branding** and make it yours.

Notes about the free plan: the free web service sleeps after ~15 minutes
without visitors (first visit then takes ~1 minute), and **free Render
Postgres is deleted after 30 days**. For a real shop pick the *Starter* web
service and a paid database (that also gives you daily backups). Change `plan:`
in `render.yaml` or in the dashboard.

To deploy changes later: `git add . ; git commit -m "..." ; git push` — Render
rebuilds automatically.

## Option B: Replit

1. replit.com → **Create Repl → Import from GitHub** → pick your repo
   (or upload the zip).
2. Tools → **Database** → create a PostgreSQL database. Replit sets
   `DATABASE_URL` for you.
3. Tools → **Secrets** → add `SETUP_TOKEN` (any long random text, e.g. from
   `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`),
   `NODE_ENV` = `production` (for the deployment) and later your keys.
4. Click **Run** to try it in the workspace (dev mode).
5. **Deploy** → choose **Reserved VM** (recommended: the background job that
   re-checks payments keeps running) or **Autoscale** (cheaper; it sleeps when
   idle, payment webhooks still wake it).
   - Build command: `pnpm install --frozen-lockfile && pnpm run build`
   - Run command: `node --enable-source-maps artifacts/api-server/dist/index.mjs`
   - Make sure the deployment has the same Secrets, plus
     `PUBLIC_URL` = your `https://….replit.app` address.
6. Open `/admin` on the deployed address and create the owner with the setup token.

## Option C: any server with Docker

```powershell
Copy-Item .env.example .env       # fill it in
docker compose up --build         # app on http://localhost:8080, Postgres included
```
The image (`Dockerfile`) runs as a non-root user and has a health check on
`/api/readyz`. Put it behind https (Caddy, nginx, Cloudflare Tunnel…) and remove
`COOKIE_SECURE: "false"` from `docker-compose.yml`.

---

## 2. Payment keys

Switch methods on/off in **Admin → Payments & delivery** (owner only). A method
appears at checkout only when it's switched on **and** its keys are set.
Start with **test/sandbox** keys, place a test order, then swap to live keys.
After changing keys, restart/redeploy.

### Cash on delivery / pay at pickup
No keys. Staff press **Mark as paid** in the order when the money arrives.

### Flutterwave (MTN MoMo, Airtel Money, cards)
1. Sign up at **dashboard.flutterwave.com** (Uganda is supported).
2. Turn on **Test mode** (switch at the top) → **Settings → API Keys** → copy the
   **Secret key** (`FLWSECK_TEST-…`) → host secret **`FLW_SECRET_KEY`**.
3. **Settings → Webhooks**:
   - URL: `https://YOUR-SITE/api/payments/webhook/flutterwave`
     (shown with a copy button in Admin → Payments & delivery)
   - Secret hash: make up a long random string, paste it there **and** in the
     host secret **`FLW_SECRET_HASH`**.
   - Tick "Receive webhook response in JSON format" if offered.
4. Optional: `FLW_PAYMENT_OPTIONS=mobilemoneyuganda,card`,
   `FLW_FALLBACK_EMAIL=orders@yourshop.com` (Flutterwave needs an email; used
   when the customer gives none).
5. Going live: complete Flutterwave's business verification (KYC), switch off
   Test mode, copy the **live** secret key, set the webhook again in live mode.

### Pesapal (MTN MoMo, Airtel Money, cards)
1. Sandbox: **developer.pesapal.com** → sandbox/demo merchant keys (consumer key + secret).
2. Host secrets: **`PESAPAL_CONSUMER_KEY`**, **`PESAPAL_CONSUMER_SECRET`**,
   **`PESAPAL_ENV=sandbox`**.
3. The server registers its IPN (payment notification) URL
   `https://YOUR-SITE/api/payments/webhook/pesapal` automatically. `PUBLIC_URL`
   must be your real https address.
4. Going live: open a merchant account at **pesapal.com**, finish verification,
   use the live keys and set **`PESAPAL_ENV=live`**.

### How a payment works (all methods)
Customer checks out → the **server** calculates the total and creates the order
→ for online methods it asks Flutterwave/Pesapal for a payment page and sends
the customer there → the customer pays with MoMo/Airtel/card → the provider
sends the customer back to `/order/CODE` and notifies our webhook → the server
**asks the provider's API** whether it's paid and checks amount + currency
before marking it paid. Unpaid online orders are cancelled after
`PAYMENT_TIMEOUT_MINUTES` (60) and their stock is released. Refunds: send the
money back from the provider dashboard, then press **Record refund** in the order.

## 3. SMS and email (optional)

Without keys, messages are only written to the server log.

**SMS — Africa's Talking**
1. account.africastalking.com → sign up → **Go to sandbox app** →
   Settings → **API Key** → generate.
2. Secrets: `AT_USERNAME=sandbox`, `AT_API_KEY=…` (sandbox messages show in
   the AT simulator, not on real phones).
3. Live: create an app, top up airtime credit, generate a live key; use your
   app username. Optional `AT_SENDER_ID` once AT approves a sender name.
4. `NOTIFY_SHOP_PHONE=+2567…` gets a text for every new order.

**Email — any SMTP**
- Gmail: turn on 2-Step Verification → myaccount.google.com/apppasswords →
  create an app password. Then `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`,
  `SMTP_SECURE=true`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>`,
  `SMTP_FROM="My Shop <you@gmail.com>"`.
- Or Brevo/Mailgun/Zoho with the SMTP details they give you.
- `NOTIFY_SHOP_EMAIL` gets an email for every new order.

## 4. "Sign in with Google / GitHub" for staff (optional)

Only works for staff who **already have an account** with the same (verified)
email. Callback URLs use your `PUBLIC_URL`.

- **Google:** console.cloud.google.com → create a project → **APIs & Services →
  OAuth consent screen** (External, add your email) → **Credentials → Create
  credentials → OAuth client ID → Web application** → Authorized redirect URI:
  `https://YOUR-SITE/api/auth/oauth/google/callback` → copy the ID and secret
  into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **GitHub:** github.com → Settings → Developer settings → **OAuth Apps → New**
  → Homepage `https://YOUR-SITE`, callback
  `https://YOUR-SITE/api/auth/oauth/github/callback` → copy into
  `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

Until they're set, the buttons show "Google sign-in isn't set up yet".

## 5. Backups

Everything (orders, products, settings **and uploaded images**) is in Postgres,
so backing up the database backs up the shop.

- **Render paid / Replit / Neon / Supabase:** turn on the provider's automatic
  daily backups / point-in-time restore.
- **Manual backup from your PC** (install PostgreSQL client tools, then):
  ```powershell
  $env:DB="postgres://...external connection string..."
  pg_dump $env:DB -Fc -f "shop-$(Get-Date -Format yyyy-MM-dd).dump"
  ```
  Restore into an empty database: `pg_restore --no-owner -d $env:NEWDB shop-2026-11-04.dump`.
- Keep backups somewhere private: they contain customers' names and phones.
- Test a restore once, before you need it.

## 6. Health checks and logs

- `GET /api/healthz` → the process is up. `GET /api/readyz` → the database
  answers too (used by Render and Docker).
- Logs are one JSON object per line in production (`LOG_LEVEL=info`), with no
  passwords, cookies or keys.

## 7. When something goes wrong

| Symptom | Fix |
|---|---|
| Build fails on `pnpm install` | Use Node 24 and pnpm 10; don't delete `pnpm-lock.yaml`. |
| `/api/readyz` says not ready | `DATABASE_URL` is wrong or the database is asleep/deleted. |
| Admin says "PUBLIC_URL is not https" | Set `PUBLIC_URL` to your real `https://` address and redeploy. |
| Online payment method doesn't show at checkout | Keys missing (see the badge in Payments & delivery), method switched off, or currency not supported. |
| Payment paid but order still "waiting" | Webhook URL/secret hash wrong; press **Check again** on the order page; the server also re-checks every 5 minutes. |
| Locked out of the only owner account | Wait `LOGIN_LOCK_MINUTES`; or ask another owner to reset it. |
