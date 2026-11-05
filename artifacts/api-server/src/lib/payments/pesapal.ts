import { env } from "../env";
import { logger } from "../logger";
import { readJson, ProviderError, type PaymentProvider, type VerifyResult } from "./types";

/**
 * Pesapal API 3.0: mobile money (MTN, Airtel), cards and more on Pesapal's page.
 *
 * Keys: PESAPAL_CONSUMER_KEY / PESAPAL_CONSUMER_SECRET from your Pesapal
 * merchant account (sandbox demo keys: https://developer.pesapal.com).
 * PESAPAL_ENV=sandbox (default) or live.
 * The IPN (payment notification) URL {PUBLIC_URL}/api/payments/webhook/pesapal is
 * registered automatically on first use, or set PESAPAL_IPN_ID yourself.
 *
 * Pesapal IPNs are NOT signed, so we never trust their content: every IPN
 * just triggers a GetTransactionStatus call to Pesapal's API.
 */
let token: { value: string; expires: number } | null = null;
let ipnId: string | null = null;

async function getToken(): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const res = await fetch(`${env.pesapal.apiBase}/Auth/RequestToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ consumer_key: env.pesapal.consumerKey, consumer_secret: env.pesapal.consumerSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await readJson(res);
  if (!res.ok || typeof body?.token !== "string") throw new ProviderError("Pesapal authentication failed", { status: res.status, error: body?.error?.code });
  token = { value: body.token, expires: Date.now() + 4 * 60_000 }; // tokens last 5 minutes
  return token.value;
}

async function call(path: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const t = await getToken();
  const res = await fetch(`${env.pesapal.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${t}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  return { ok: res.ok, status: res.status, body: await readJson(res) };
}

export const pesapalIpnUrl = () => `${env.publicUrl}/api/payments/webhook/pesapal`;

async function getIpnId(): Promise<string> {
  if (env.pesapal.ipnId) return env.pesapal.ipnId;
  if (ipnId) return ipnId;
  const { ok, body } = await call("/URLSetup/RegisterIPN", {
    method: "POST",
    body: JSON.stringify({ url: pesapalIpnUrl(), ipn_notification_type: "GET" }),
  });
  if (!ok || typeof body?.ipn_id !== "string") throw new ProviderError("Pesapal IPN registration failed", { error: body?.error?.code });
  ipnId = body.ipn_id;
  logger.info("Registered Pesapal IPN URL (set PESAPAL_IPN_ID to skip this on start-up)");
  return ipnId!;
}

function splitName(full: string) {
  const parts = full.trim().split(/\s+/);
  return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
}

export const pesapal: PaymentProvider = {
  id: "pesapal",
  label: "Pesapal (Mobile Money or card)",
  description: "MTN MoMo, Airtel Money, Visa or Mastercard — secure checkout by Pesapal",
  configured: () => Boolean(env.pesapal.consumerKey && env.pesapal.consumerSecret),
  mode: () => (!env.pesapal.consumerKey ? "off" : env.pesapal.live ? "live" : "test"),
  missing: () => [!env.pesapal.consumerKey && "PESAPAL_CONSUMER_KEY", !env.pesapal.consumerSecret && "PESAPAL_CONSUMER_SECRET"].filter(Boolean) as string[],
  supportsCurrency: (code) => ["UGX", "KES", "TZS", "RWF", "MWK", "ZMW", "USD"].includes(code),

  async initiate({ order, payment, returnUrl }) {
    const notification_id = await getIpnId();
    const { first, last } = splitName(order.customerName);
    const { ok, body } = await call("/Transactions/SubmitOrderRequest", {
      method: "POST",
      body: JSON.stringify({
        id: payment.reference,
        currency: payment.currency,
        amount: payment.amount,
        description: `Order ${order.code}`.slice(0, 100),
        callback_url: returnUrl,
        notification_id,
        billing_address: {
          email_address: order.customerEmail || undefined,
          phone_number: order.customerPhone || undefined,
          first_name: first.slice(0, 50),
          last_name: last.slice(0, 50),
        },
      }),
    });
    if (!ok || typeof body?.redirect_url !== "string" || body?.error) {
      throw new ProviderError("Pesapal did not return a checkout link", { status: body?.status, error: body?.error?.code });
    }
    return { checkoutUrl: body.redirect_url, providerRef: String(body.order_tracking_id ?? "") || null };
  },

  async verify(payment): Promise<VerifyResult> {
    if (!payment.providerRef) return { status: "pending" };
    const { ok, status, body } = await call(`/Transactions/GetTransactionStatus?orderTrackingId=${encodeURIComponent(payment.providerRef)}`);
    if (!ok) throw new ProviderError(`Pesapal status check failed (${status})`);
    // status_code: 0 INVALID (not paid yet), 1 COMPLETED, 2 FAILED, 3 REVERSED
    const code = Number(body?.status_code);
    const mapped: VerifyResult["status"] = code === 1 ? "paid" : code === 2 ? "failed" : code === 3 ? "refunded" : "pending";
    return {
      status: mapped,
      amount: Number(body?.amount),
      currency: String(body?.currency ?? ""),
      reference: String(body?.merchant_reference ?? ""),
      providerRef: payment.providerRef,
      method: body?.payment_method ? String(body.payment_method) : null,
      reason: body?.description ? String(body.description).slice(0, 200) : null,
      raw: { status_code: body?.status_code, payment_status_description: body?.payment_status_description, payment_method: body?.payment_method, confirmation_code: body?.confirmation_code },
    };
  },
};
