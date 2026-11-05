import type { Order, Payment } from "@workspace/db";
import type { SiteSettings } from "@workspace/business";

export type OnlineProviderId = "flutterwave" | "pesapal";

export interface InitiateResult {
  /** Where to send the customer to pay (provider's hosted page). */
  checkoutUrl: string;
  /** Provider's own id for this attempt if known now (Pesapal order_tracking_id). */
  providerRef?: string | null;
}

/** Result of asking the PROVIDER's API (never the browser) what happened. */
export interface VerifyResult {
  status: "pending" | "paid" | "failed" | "refunded";
  amount?: number;
  currency?: string;
  /** Our reference as echoed back by the provider (must match). */
  reference?: string;
  providerRef?: string | null;
  method?: string | null;
  reason?: string | null;
  raw?: Record<string, unknown>;
}

export interface PaymentProvider {
  id: OnlineProviderId;
  /** Shown to customers at checkout. */
  label: string;
  description: string;
  configured(): boolean;
  mode(): "live" | "test" | "off";
  /** Names of env variables that still need a value (never their values). */
  missing(): string[];
  supportsCurrency(code: string): boolean;
  initiate(ctx: { order: Order; payment: Payment; settings: SiteSettings; returnUrl: string }): Promise<InitiateResult>;
  verify(payment: Payment): Promise<VerifyResult>;
}

export class ProviderError extends Error {
  constructor(message: string, readonly detail?: unknown) {
    super(message);
  }
}

export async function readJson(res: globalThis.Response): Promise<any> {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text.slice(0, 300) };
  }
}
