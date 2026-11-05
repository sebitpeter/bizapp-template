# Rebranding this app for another business

This app is a **white-label shop**: a public storefront (products, basket, ordering)
plus a staff admin portal with owner/manager/staff accounts. You can turn it into a shop for a
different business in two ways. Most people use **both**: route 2 once for the
code-level defaults, then route 1 for day-to-day tweaks.

| | Route 1: Admin → Branding (no code) | Route 2: `business/business.config.ts` (code) |
|---|---|---|
| Who | The shop owner, in the browser | The developer (you) |
| Changes | Name, tagline, logo, favicon, hero image, colours, contact details, socials, opening hours, currency, categories, SEO | **Everything** in route 1 (as *defaults*) **plus** all website wording, order-status names and fonts |
| Takes effect | Instantly, no redeploy | After a rebuild/redeploy |
| Stored in | The database (`site_settings` table) | Git |

> **Which one wins?** Values saved in Admin → Branding win. The config file
> only supplies the defaults, so a fresh database (or **Reset to defaults** on the
> Branding page) shows what is in the config file.

---

## Route 1: In the browser (Admin → Branding)

1. Go to `https://your-site/admin` and sign in with an **owner** account
   (only owners can change branding).
2. Open **Branding** in the sidebar.
3. Edit what you like. The **Live preview** on the right updates as you type.
   - **Logo / favicon / hero image**: click *Upload* (PNG, JPG or WebP, up to 2 MB)
     or paste an `https://` link. SVG files are refused on purpose (they can
     contain scripts).
   - **Colours**: pick a preset (Bakery, Coffee, Fresh, Ocean, Mono), or set the five
     colours yourself with the colour pickers. A yellow warning appears if text
     would be hard to read.
   - **Contact, socials, hours, currency, categories, SEO**: plain form fields.
     Every field is checked before saving.
4. Click **Save changes**. The storefront updates straight away.
5. **Reset to defaults** puts everything back to what is in `business.config.ts`.

Owners also set **Payments & delivery** (which payment methods, delivery
zones and fees, free-delivery threshold, minimum order, pickup address and the
default phone country code, e.g. 256 for Uganda, 254 Kenya, 255 Tanzania).

Use **Website text** to edit the announcement bar, hero title, hero subtitle and the
"Our story" paragraph. Use **Products** to add, edit and delete products and their photos.

---

## Route 2: In code (a new business from scratch)

All business-specific code-level data lives in **one folder**:

```
business/
├── business.config.ts        ← 1. name, colours, contact, wording, fonts…
├── seed/data.json            ← 2. starter products, reviews, website text
├── examples/coffee-shop/     ← a complete worked example (see below)
└── src/                      ← the schema that checks both files (don't edit)
artifacts/storefront/public/
└── hero.png                  ← 3. default hero photo (optional)
```

### Step by step

1. **Edit `business/business.config.ts`**
   - `settings`: name, tagline, colours, contact, socials, hours, currency
     (`code` such as `UGX`, `KES`, `USD`; `locale` such as `en-UG`), categories, SEO.
   - `copy`: every sentence on the website (banner, buttons, section titles,
     checkout dialog, footer, admin titles…).
   - `statusLabels`: what customers and staff see for each order status, for
     example `Preparing: "Brewing"`.
   - `fonts`: a Google Fonts URL plus the three font families. Use
     `googleFontsUrl: ""` for system fonts only.
2. **Replace `business/seed/data.json`** with your own products, reviews and
   website text. It is loaded **only into an empty database** the first time the
   API starts. Product `category` values should match `settings.categories`.
3. **Replace `artifacts/storefront/public/hero.png`** (or point `heroImageUrl` at
   an `https://` image).
4. Check it, run it and look:
   ```powershell
   pnpm run typecheck
   pnpm dev:api      # terminal 1
   pnpm dev:web      # terminal 2 → http://localhost:5173
   ```
   If you get a schema error, the message names the field that is wrong.
5. **Already have a database from the old business?** The seed won't run again,
   and settings saved in the admin override the config. Either use a new
   database, or delete the old rows (`TRUNCATE products, orders, reviews,
   content_entries, site_settings, media RESTART IDENTITY;` in your SQL console) and
   restart the API.

The page `<title>`, description, favicon, colours and fonts in `index.html` are filled in
**at build time** from the config by a small plugin in
`artifacts/storefront/vite.config.ts`, so you never edit `index.html` by hand.

---

## Worked example: a coffee shop

A full coffee-shop version is in `business/examples/coffee-shop/`.

```powershell
# Windows PowerShell, from the repo root
Copy-Item business\examples\coffee-shop\business.config.ts business\business.config.ts -Force
Copy-Item business\examples\coffee-shop\data.json business\seed\data.json -Force
```

Then open `business/business.config.ts` and change the import on the first code line
from `"../../src/schema"` to `"./src/schema"`. Run `pnpm run typecheck`.

What changes, side by side:

```ts
// bakery (default)                         // coffee shop (example)
name: "Bake&Bite",                          name: "Ember Coffee",
tagline: "slow food / good mood",           tagline: "roasted in kampala",
colors: { primary: "#8d304d", … }           colors: { primary: "#2f5d50", … }
currency: { code: "USD", locale: "en-US" }  currency: { code: "UGX", locale: "en-UG" }
categories: ["Breads", "Pastries", …]       categories: ["Espresso", "Filter", "Cold drinks", "Beans", "Snacks"]
statusLabels: { Preparing: "Baking" }       statusLabels: { Preparing: "Brewing" }
copy.nav.products: "Today's bakes"          copy.nav.products: "Menu"
```

Without touching code, an owner could get most of the way there in the browser:
**Admin → Branding → Coffee preset**, type the new name, upload a logo, and Save.

---

## Renaming other things (optional)

| Thing | Where |
|---|---|
| Package names (`@workspace/storefront`, …) | `package.json` files. Generic already, no need to change |
| Browser tab title / social preview | `settings.seo` (or Admin → Branding → SEO) |
| Replit preview title | `artifacts/storefront/.replit-artifact/artifact.toml` |
| Database name | your `DATABASE_URL` |

## Checklist for a new client

- [ ] `business.config.ts` edited and `pnpm run typecheck` passes
- [ ] `seed/data.json` replaced (prices in the right currency!)
- [ ] `hero.png` replaced
- [ ] New database, or old rows cleared
- [ ] **New** `SETUP_TOKEN` (or `OWNER_*`) for this client, and their own owner account (see SECURITY.md)
- [ ] The client's **own** Flutterwave/Pesapal keys (test first), SMS and SMTP keys — never reuse another client's
- [ ] Admin → **Payments & delivery**: methods, delivery zones and fees, pickup address, phone country code
- [ ] `PUBLIC_URL` set to the client's https address; one test order paid end to end
- [ ] Logged into `/admin`, uploaded the logo, checked colours on a phone
