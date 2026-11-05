import fs from "node:fs";
import path from "node:path";
import { count } from "drizzle-orm";
import { contentTable, db, ordersTable, productsTable, reviewsTable, type OrderLine } from "@workspace/db";
import { seedDataSchema, type SeedData } from "@workspace/business";
import { env } from "./env";
import { logger } from "./logger";
import { roundFor } from "./money";
import { newOrderCode } from "./orders";
import { normalizePhone } from "./phone";
import { defaultSettings } from "./settings";

/**
 * Starter data comes from business/seed/data.json (or SEED_FILE).
 * To start a different business, swap that file — no code changes.
 * Products/reviews/orders are only inserted into an EMPTY database, so
 * restarting never overwrites what the admin has changed. Missing content
 * keys are always added (safe: existing values are left alone).
 */
function findSeedFile(): string | null {
  const candidates = [
    env.seedFile,
    path.resolve(__dirname, "..", "..", "..", "business", "seed", "data.json"), // from artifacts/api-server/dist
    path.resolve(process.cwd(), "business", "seed", "data.json"), // run from repo root
    path.resolve(process.cwd(), "..", "..", "business", "seed", "data.json"), // run from artifacts/api-server
  ].filter((p): p is string => Boolean(p));
  return candidates.find((p) => fs.existsSync(p)) ?? null;
}

export function loadSeedData(): SeedData | null {
  const file = findSeedFile();
  if (!file) {
    logger.warn("No seed file found (business/seed/data.json); skipping seed");
    return null;
  }
  const parsed = seedDataSchema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")));
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Seed file ${file} is invalid:\n  ${issues.join("\n  ")}`);
  }
  logger.info({ file }, "Loaded seed data");
  return parsed.data;
}

export async function seedDatabase(): Promise<void> {
  if (!env.seedOnStart) return;
  const data = loadSeedData();
  if (!data) return;

  if (data.content.length) {
    await db.insert(contentTable).values(data.content).onConflictDoNothing({ target: contentTable.key });
  }

  const [{ value: productCount }] = await db.select({ value: count() }).from(productsTable);
  if (productCount > 0) return;

  const products = data.products.length ? await db.insert(productsTable).values(data.products).returning() : [];
  if (data.reviews.length) await db.insert(reviewsTable).values(data.reviews);

  const bySlug = new Map(products.map((p) => [p.slug, p]));
  const settings = defaultSettings();
  const currency = settings.currency.code;
  for (const sample of data.sampleOrders) {
    const items: OrderLine[] = sample.items.flatMap(({ slug, quantity }) => {
      const p = bySlug.get(slug);
      if (!p) {
        logger.warn({ slug }, "Sample order references unknown product slug; skipping line");
        return [];
      }
      return [{ productId: p.id, name: p.name, quantity, unitPrice: p.price }];
    });
    if (!items.length) continue;
    const subtotal = roundFor(currency, items.reduce((s, i) => s + i.quantity * i.unitPrice, 0));
    const paid = sample.status === "Completed";
    await db.insert(ordersTable).values({
      code: newOrderCode(),
      customerName: sample.customerName,
      customerEmail: sample.customerEmail,
      customerPhone: normalizePhone(sample.customerPhone ?? "", settings.checkout.phoneCountryCode) ?? "",
      items,
      subtotal,
      deliveryFee: 0,
      total: subtotal,
      currency,
      fulfillment: "pickup",
      status: sample.status,
      paymentMethod: "cod",
      paymentStatus: paid ? "paid" : "pending",
      paidAt: paid ? new Date() : null,
      deliveryNote: sample.deliveryNote,
      history: [{ at: new Date().toISOString(), type: "status", value: sample.status, by: "seed" }],
    });
  }
  logger.info({ products: products.length }, "Seeded empty database");
}
