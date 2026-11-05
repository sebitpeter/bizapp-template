import { customFetch } from "@workspace/api-client-react";

/**
 * Small typed helper for API endpoints that aren't in the generated client
 * (staff, payments, audit, newsletter, tracking…). Uses the same fetch
 * wrapper, so cookies + the CSRF header are sent automatically.
 */
export function api<T>(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T> {
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return customFetch<T>(`${base}/api${path}`, {
    method,
    credentials: "same-origin",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
    responseType: "json",
  });
}

export type Role = "owner" | "manager" | "staff";
export const ROLE_LABEL: Record<Role, string> = { owner: "Owner", manager: "Manager", staff: "Staff" };
export const ROLE_HELP: Record<Role, string> = {
  staff: "Orders: view, update status, record cash payments.",
  manager: "Everything staff can do + products & stock, website text, reviews, image uploads, refunds.",
  owner: "Everything: branding, payment settings, staff accounts, audit log, newsletter.",
};

export type StaffUser = {
  id: number;
  username: string;
  email: string;
  name: string;
  role: Role;
  disabled: boolean;
  mustChangePassword: boolean;
  locked: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type AuditEntry = {
  id: number;
  createdAt: string;
  userId: number | null;
  userEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
};

export type ProviderStatus = {
  id: "flutterwave" | "pesapal";
  label: string;
  configured: boolean;
  mode: "live" | "test" | "off";
  missing: string[];
  enabled: boolean;
  currencySupported: boolean;
};

export type PaymentsStatus = {
  currency: string;
  providers: ProviderStatus[];
  available: string[];
  webhooks: { flutterwave: string; pesapal: string };
  publicUrl: string;
  publicUrlIsHttps: boolean;
  notifications: { email: "smtp" | "console" | "off"; sms: string };
  rateLimits: "redis" | "memory";
};

export type TrackedOrder = {
  code: string;
  status: string;
  paymentStatus: "pending" | "paid" | "failed" | "refunded" | "unpaid";
  paymentMethod: string;
  customerName: string;
  items: { productId: number; name: string; quantity: number; unitPrice: number }[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  currency: string;
  fulfillment: "delivery" | "pickup";
  deliveryZone: string | null;
  pickupAddress: string | null;
  createdAt: string;
  paidAt: string | null;
  history: { at: string; type: string; value: string }[];
  checkoutUrl: string | null;
  canRetryPayment: boolean;
  expiresAt: string | null;
};

/** Secret order tokens are kept on this device only, so the confirmation page works without the phone number. */
const TOKEN_KEY = "order-tokens";
export function saveOrderToken(code: string, token: string) {
  try {
    const all = JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}") as Record<string, string>;
    all[code] = token;
    const keys = Object.keys(all);
    for (const k of keys.slice(0, Math.max(0, keys.length - 20))) delete all[k];
    localStorage.setItem(TOKEN_KEY, JSON.stringify(all));
  } catch {
    /* private mode */
  }
}
export function orderToken(code: string): string | undefined {
  try {
    return (JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}") as Record<string, string>)[code];
  } catch {
    return undefined;
  }
}
