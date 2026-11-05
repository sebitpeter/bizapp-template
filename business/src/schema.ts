import { z } from "zod";

/**
 * Validation rules for the business settings.
 *
 * The SAME schema is used by:
 *  - the API (to reject bad input on PUT /api/admin/settings),
 *  - the admin Branding page (to show friendly form errors),
 *  - the defaults in business.config.ts (checked at startup).
 */

const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a 6-digit hex colour like #8d304d");

/**
 * An image reference may be:
 *  - an uploaded file served by our API:        /api/media/<32 hex chars>.png
 *  - a file shipped in the storefront /public:  /hero.png  (no "..", no "//")
 *  - an absolute https:// URL
 * Anything else (javascript:, data:, http:, protocol-relative //evil) is rejected.
 */
export const imageRef = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) =>
      v === "" ||
      /^\/api\/media\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(v) ||
      (/^\/[A-Za-z0-9._\-/]+$/.test(v) && !v.includes("..") && !v.startsWith("//")) ||
      /^https:\/\/[^\s"'<>]+$/.test(v),
    "Must be an uploaded image, a /path in the site, or an https:// URL",
  );

const httpsUrlOrEmpty = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/.test(v), "Must start with https://");

const text = (max: number) => z.string().trim().max(max);
const money = z.number().min(0).max(1_000_000_000);

/** IDs of the payment methods the code knows about. Which ones show at checkout is
 *  decided by the owner (Admin → Payments) AND by whether the keys are set in .env. */
export const PAYMENT_METHODS = ["cod", "flutterwave", "pesapal"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHODS)[number];

export const checkoutSchema = z
  .object({
    methods: z.object({ cod: z.boolean(), flutterwave: z.boolean(), pesapal: z.boolean() }).strict(),
    /** Used to turn local numbers like 0772 123456 into +256772123456. Digits only, e.g. "256". Empty = require +country code. */
    phoneCountryCode: z.union([z.literal(""), z.string().regex(/^[1-9]\d{0,3}$/, "Digits only, e.g. 256")]),
    delivery: z
      .object({
        enabled: z.boolean(),
        zones: z
          .array(
            z
              .object({
                id: z.string().regex(/^[a-z0-9-]{1,40}$/, "Lower-case letters, digits and dashes"),
                name: text(60).min(1, "Zone name is required"),
                fee: money,
              })
              .strict(),
          )
          .max(30),
        /** Orders at or above this subtotal get free delivery (0 = never free). */
        freeOver: money,
        note: text(200),
      })
      .strict(),
    pickup: z.object({ enabled: z.boolean(), address: text(200), note: text(200) }).strict(),
    /** Minimum subtotal for an order (0 = no minimum). */
    minOrder: money,
  })
  .strict()
  .refine((c) => c.delivery.enabled || c.pickup.enabled, { message: "Turn on delivery or pickup (or both)", path: ["delivery", "enabled"] })
  .refine((c) => !c.delivery.enabled || c.delivery.zones.length > 0, { message: "Add at least one delivery zone", path: ["delivery", "zones"] })
  .refine((c) => c.methods.cod || c.methods.flutterwave || c.methods.pesapal, { message: "Turn on at least one payment method", path: ["methods"] })
  .refine((c) => new Set(c.delivery.zones.map((z) => z.id)).size === c.delivery.zones.length, { message: "Zone ids must be unique", path: ["delivery", "zones"] });

export type CheckoutSettings = z.infer<typeof checkoutSchema>;

export const siteSettingsSchema = z
  .object({
    name: text(60).min(1, "Business name is required"),
    tagline: text(80),
    logoUrl: imageRef,
    faviconUrl: imageRef,
    heroImageUrl: imageRef,
    colors: z
      .object({
        primary: hex, // buttons, links, highlights
        accent: hex, // badges, secondary highlights
        ink: hex, // main text + dark sections (footer, story)
        background: hex, // page background
        surface: hex, // cards, drawers
      })
      .strict(),
    contact: z
      .object({
        email: z.union([z.literal(""), z.string().trim().max(254).email("Invalid email")]),
        phone: text(40),
        whatsapp: text(40),
        address: text(200),
        city: text(80),
        mapUrl: httpsUrlOrEmpty,
      })
      .strict(),
    socials: z
      .object({
        instagram: httpsUrlOrEmpty,
        facebook: httpsUrlOrEmpty,
        x: httpsUrlOrEmpty,
        tiktok: httpsUrlOrEmpty,
        website: httpsUrlOrEmpty,
      })
      .strict(),
    hours: z
      .array(z.object({ label: text(40).min(1), value: text(60).min(1) }).strict())
      .max(10),
    currency: z
      .object({
        code: z.string().regex(/^[A-Z]{3}$/, "3-letter ISO code, e.g. USD, KES, UGX"),
        locale: z
          .string()
          .regex(/^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/, "Locale like en-US or en-UG"),
      })
      .strict(),
    categories: z.array(text(40).min(1)).min(1).max(20),
    seo: z
      .object({
        title: text(70),
        description: text(160),
      })
      .strict(),
    checkout: checkoutSchema,
  })
  .strict();

export type SiteSettings = z.infer<typeof siteSettingsSchema>;

/** Static UI copy. Edit in business.config.ts (needs a rebuild / redeploy). */
export type BusinessCopy = {
  topBanner: string;
  nav: { products: string; story: string; visit: string; staff: string };
  hero: { eyebrow: string; cta: string; nextUp: string; badge: string; note: string; noteLabel: string; imageAlt: string };
  products: { eyebrow: string; title: string; searchPlaceholder: string; countSuffix: string; addedToCart: string; empty: string };
  story: { eyebrow: string; title: string; highlight: string; points: { title: string; body: string }[] };
  reviews: { eyebrow: string; title: string; verified: string };
  visit: { eyebrow: string; title: string; body: string; cardLabel: string; cardText: string };
  newsletter: { eyebrow: string; title: string; body: string; button: string; done: string };
  cart: { eyebrow: string; title: string; emptyTitle: string; emptyBody: string; footnote: string; checkout: string };
  checkout: { eyebrow: string; title: string; notePlaceholder: string; placeOrder: string; success: string };
  footer: { line: string; signoff: string };
  admin: { title: string };
};

export const ORDER_STATUSES = ["Pending", "Confirmed", "Preparing", "Ready for Pickup", "Out for Delivery", "Completed", "Cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type BusinessConfig = {
  /** Defaults for everything an admin can also change at runtime (Admin → Branding). */
  settings: SiteSettings;
  /** Words used across the storefront. */
  copy: BusinessCopy;
  /** How each order status is shown to staff (e.g. "Preparing" → "Baking" for a bakery). */
  statusLabels: Record<OrderStatus, string>;
  /** Google Fonts used by the storefront. */
  fonts: { googleFontsUrl: string; sans: string; serif: string; mono: string };
};

export function parseSettings(input: unknown): SiteSettings {
  return siteSettingsSchema.parse(input);
}

/** Deep-merge saved overrides on top of defaults (objects merge, arrays/values replace). */
export function mergeSettings(defaults: SiteSettings, overrides: unknown): SiteSettings {
  const merge = (base: unknown, over: unknown): unknown => {
    if (over === undefined || over === null) return base;
    if (typeof base === "object" && base !== null && !Array.isArray(base) && typeof over === "object" && !Array.isArray(over)) {
      const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
      for (const [k, v] of Object.entries(over as Record<string, unknown>)) {
        if (k in out) out[k] = merge(out[k], v);
      }
      return out;
    }
    return typeof over === typeof base ? over : base;
  };
  const merged = merge(defaults, overrides);
  const parsed = siteSettingsSchema.safeParse(merged);
  return parsed.success ? parsed.data : defaults;
}
