import type { SiteSettings, PaymentMethodId } from "@workspace/business";
import { flutterwave } from "./flutterwave";
import { pesapal } from "./pesapal";
import type { OnlineProviderId, PaymentProvider } from "./types";

export const providers: Record<OnlineProviderId, PaymentProvider> = { flutterwave, pesapal };

export const isOnline = (m: string): m is OnlineProviderId => m === "flutterwave" || m === "pesapal";

/**
 * Methods customers can actually use right now: switched on by the owner
 * (Admin → Payments) AND configured in .env AND able to take the shop currency.
 */
export function availableMethods(settings: SiteSettings): PaymentMethodId[] {
  const out: PaymentMethodId[] = [];
  if (settings.checkout.methods.cod) out.push("cod");
  for (const id of ["flutterwave", "pesapal"] as const) {
    const p = providers[id];
    if (settings.checkout.methods[id] && p.configured() && p.supportsCurrency(settings.currency.code)) out.push(id);
  }
  return out;
}

export function providerStatus(settings: SiteSettings) {
  return (Object.values(providers) as PaymentProvider[]).map((p) => ({
    id: p.id,
    label: p.label,
    enabled: settings.checkout.methods[p.id],
    configured: p.configured(),
    mode: p.mode(),
    missing: p.missing(),
    currencySupported: p.supportsCurrency(settings.currency.code),
  }));
}

export type { PaymentProvider, OnlineProviderId } from "./types";
