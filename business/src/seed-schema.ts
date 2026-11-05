import { z } from "zod";
import { imageRef, ORDER_STATUSES } from "./schema";

/** Shape of seed/data.json — validated before anything is written to the database. */
export const seedDataSchema = z.object({
  $comment: z.string().optional(),
  products: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        slug: z.string().regex(/^[a-z0-9-]{1,120}$/),
        category: z.string().min(1).max(40),
        price: z.number().nonnegative().max(1_000_000),
        description: z.string().max(2000),
        imageUrl: imageRef,
        rating: z.number().min(0).max(5).default(5),
        reviewCount: z.number().int().min(0).default(0),
        ingredients: z.array(z.string().max(80)).max(50).default([]),
        tags: z.array(z.string().max(40)).max(20).default([]),
        available: z.boolean().default(true),
        /** Leave out (or null) for "never runs out"; a number = units in stock. */
        stock: z.number().int().min(0).max(1_000_000).nullable().default(null),
      }),
    )
    .max(500),
  reviews: z
    .array(
      z.object({
        customerName: z.string().max(100),
        quote: z.string().max(1000),
        rating: z.number().int().min(1).max(5),
        verified: z.boolean().default(false),
        productName: z.string().max(120),
      }),
    )
    .default([]),
  content: z
    .array(z.object({ key: z.string().regex(/^[a-z0-9_]{1,40}$/), label: z.string().max(80), value: z.string().max(5000) }))
    .default([]),
  sampleOrders: z
    .array(
      z.object({
        customerName: z.string().max(100),
        customerEmail: z.string().max(254).default(""),
        customerPhone: z.string().max(20).default(""),
        items: z.array(z.object({ slug: z.string(), quantity: z.number().int().min(1).max(50) })).min(1),
        status: z.enum(ORDER_STATUSES),
        deliveryNote: z.string().max(500).nullable().default(null),
      }),
    )
    .default([]),
});

export type SeedData = z.infer<typeof seedDataSchema>;
