import { Router, type IRouter } from "express";
import { and, eq, ilike, or } from "drizzle-orm";
import { db, productsTable } from "@workspace/db";
import {
  CreateProductBody,
  DeleteProductParams,
  GetProductParams,
  ListProductsQueryParams,
  ListProductsResponse,
  UpdateProductBody,
  UpdateProductParams,
} from "@workspace/api-zod";
import { imageRef } from "@workspace/business";
import { audit } from "../lib/audit";
import { requireAuth } from "../lib/auth";
import { cleanupMedia, replacedMedia, mediaIdsIn } from "../lib/media";
import { badRequest, isUniqueViolation } from "../lib/http";

const router: IRouter = Router();

/** Escape % and _ so a search for "50%" doesn't match everything. */
const escapeLike = (value: string) => value.replace(/[\\%_]/g, (c) => `\\${c}`);

const checkImage = (url: string | undefined) => url === undefined || imageRef.safeParse(url).success;

router.get("/products", async (req, res): Promise<void> => {
  const parsed = ListProductsQueryParams.safeParse(req.query);
  if (!parsed.success) return badRequest(res, parsed.error);
  const { category, search } = parsed.data;
  const filters = [];
  if (category && category !== "All") filters.push(eq(productsTable.category, category));
  if (search) {
    const pattern = `%${escapeLike(search)}%`;
    filters.push(or(ilike(productsTable.name, pattern), ilike(productsTable.description, pattern)));
  }
  const products = await db
    .select()
    .from(productsTable)
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(productsTable.id);
  res.json(ListProductsResponse.parse(products));
});

router.get("/products/:id", async (req, res): Promise<void> => {
  const parsed = GetProductParams.safeParse(req.params);
  if (!parsed.success) return badRequest(res, parsed.error);
  const [product] = await db.select().from(productsTable).where(eq(productsTable.id, parsed.data.id));
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  res.json(product);
});

router.post("/products", requireAuth("products.manage"), async (req, res): Promise<void> => {
  // The zod schema only keeps known fields, so id/rating/reviewCount can't be injected.
  const parsed = CreateProductBody.safeParse(req.body);
  if (!parsed.success) return badRequest(res, parsed.error);
  if (!checkImage(parsed.data.imageUrl)) return badRequest(res, "imageUrl must be an uploaded image, a /local path or an https:// URL");
  try {
    const [product] = await db
      .insert(productsTable)
      .values({
        ...parsed.data,
        ingredients: parsed.data.ingredients ?? [],
        tags: parsed.data.tags ?? [],
        available: parsed.data.available ?? true,
      })
      .returning();
    await audit(req, "product.create", "product", product.id, { name: product.name, price: product.price, stock: product.stock });
    res.status(201).json(product);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A product with this slug already exists" });
      return;
    }
    throw err;
  }
});

router.patch("/products/:id", requireAuth("products.manage"), async (req, res): Promise<void> => {
  const params = UpdateProductParams.safeParse(req.params);
  if (!params.success) return badRequest(res, params.error);
  const body = UpdateProductBody.safeParse(req.body);
  if (!body.success) return badRequest(res, body.error);
  if (!checkImage(body.data.imageUrl)) return badRequest(res, "imageUrl must be an uploaded image, a /local path or an https:// URL");
  if (Object.keys(body.data).length === 0) return badRequest(res, "Nothing to update");
  try {
    const [before] = await db.select().from(productsTable).where(eq(productsTable.id, params.data.id));
    if (!before) {
      res.status(404).json({ error: "Product not found" });
      return;
    }
    const [product] = await db.update(productsTable).set(body.data).where(eq(productsTable.id, params.data.id)).returning();
    const changes: Record<string, unknown> = {};
    for (const k of Object.keys(body.data) as (keyof typeof body.data)[]) {
      if (JSON.stringify(before[k]) !== JSON.stringify(product[k])) changes[k] = k === "description" ? "(changed)" : { from: before[k], to: product[k] };
    }
    await audit(req, "product.update", "product", product.id, { name: product.name, changes });
    void cleanupMedia(replacedMedia(before.imageUrl, product.imageUrl));
    res.json(product);
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({ error: "A product with this slug already exists" });
      return;
    }
    throw err;
  }
});

router.delete("/products/:id", requireAuth("products.manage"), async (req, res): Promise<void> => {
  const parsed = DeleteProductParams.safeParse(req.params);
  if (!parsed.success) return badRequest(res, parsed.error);
  const [product] = await db.delete(productsTable).where(eq(productsTable.id, parsed.data.id)).returning();
  if (!product) {
    res.status(404).json({ error: "Product not found" });
    return;
  }
  await audit(req, "product.delete", "product", product.id, { name: product.name });
  void cleanupMedia(mediaIdsIn(product.imageUrl));
  res.sendStatus(204);
});

export default router;
