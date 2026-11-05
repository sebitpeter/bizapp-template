import type { Role } from "@workspace/db";

/**
 * Who can do what. The API checks these on every request; the admin UI
 * uses the same list (sent with the session) to hide buttons you can't use.
 *
 *   staff   – take care of orders (view, change status, record cash payments)
 *   manager – staff + products/stock, website text, reviews, image uploads, refunds
 *   owner   – everything: branding, payment settings, staff accounts, audit log, newsletter
 */
export const PERMISSIONS = {
  "dashboard.view": ["owner", "manager", "staff"],
  "orders.view": ["owner", "manager", "staff"],
  "orders.update": ["owner", "manager", "staff"],
  "orders.markPaid": ["owner", "manager", "staff"],
  "orders.refund": ["owner", "manager"],
  "products.manage": ["owner", "manager"],
  "content.manage": ["owner", "manager"],
  "reviews.moderate": ["owner", "manager"],
  "uploads.create": ["owner", "manager"],
  "settings.branding": ["owner"],
  "settings.payments": ["owner"],
  "users.manage": ["owner"],
  "audit.view": ["owner"],
  "newsletter.view": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof PERMISSIONS;

export function can(role: Role, permission: Permission): boolean {
  return (PERMISSIONS[permission] as readonly Role[]).includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return (Object.keys(PERMISSIONS) as Permission[]).filter((p) => can(role, p));
}
