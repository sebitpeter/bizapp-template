import { env, isProduction } from "../env";
import { readJson, ProviderError, type PaymentProvider, type VerifyResult } from "./types";

/**
 * Flutterwave Standard (v3): mobile money (MTN MoMo / Airtel Money in Uganda,
 * M-Pesa in Kenya, ...) and cards on Flutterwave's hosted page.
 *
 * Keys (Flutterwave dashboard → Settings → API keys; use TEST keys first):
 *   FLW_SECRET_KEY   FLWSECK_TEST-...  (server only, never in the browser)
 *   FLW_SECRET_HASH  any long random string you also paste into
 *                    Settings → Webhooks → "Secret hash"
 * Webhook URL to paste in the dashboard: {PUBLIC_URL}/api/payments/webhook/flutterwave
 */
const DEFAULT_OPTIONS: Record<string, string> = {
  UGX: "mobilemoneyuganda,card",
  KES: "mpesa,card",
  GHS: "mobilemoneyghana,card",
  RWF: "mobilemoneyrwanda,card",
  ZMW: "mobilemoneyzambia,card",
  TZS: "mobilemoneytanzania,card",
  XAF: "mobilemoneyfranco,card",
  XOF: "mobilemoneyfranco,card",
  NGN: "card,banktransfer,ussd",
};

const SUPPORTED = new Set([...Object.keys(DEFAULT_OPTIONS), "USD", "EUR", "GBP", "ZAR", "MWK", "SLL", "EGP", "MAD"]);

async function call(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${env.flutterwave.apiBase}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${env.flutterwave.secretKey}`, "Content-Type": "application/json", Accept: "application/json", ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await readJson(res);
  return { ok: res.ok, status: res.status, body };
}

function mapStatus(s: unknown): VerifyResult["status"] {
  const v = String(s ?? "").toLowerCase();
  if (v === "successful" || v === "success" || v === "completed") return "paid";
  if (v === "failed" || v === "cancelled" || v === "error") return "failed";
  return "pending";
}

export const flutterwave: PaymentProvider = {
  id: "flutterwave",
  label: "Flutterwave (Mobile Money or card)",
  description: "MTN MoMo, Airtel Money, Visa or Mastercard — secure checkout by Flutterwave",
  configured: () => Boolean(env.flutterwave.secretKey && env.flutterwave.webhookHash),
  mode: () => (!env.flutterwave.secretKey ? "off" : env.flutterwave.secretKey.includes("_TEST") || (!isProduction && env.flutterwave.apiBase !== "https://api.flutterwave.com/v3") ? "test" : "live"),
  missing: () => [!env.flutterwave.secretKey && "FLW_SECRET_KEY", !env.flutterwave.webhookHash && "FLW_SECRET_HASH"].filter(Boolean) as string[],
  supportsCurrency: (code) => SUPPORTED.has(code),

  async initiate({ order, payment, settings, returnUrl }) {
    const email = order.customerEmail || env.flutterwave.fallbackEmail || settings.contact.email;
    if (!email) throw new ProviderError("An email address is needed for card / mobile money payments");
    const logo = /^https:\/\//.test(settings.logoUrl) ? settings.logoUrl : settings.logoUrl.startsWith("/") && env.publicUrl.startsWith("https://") ? `${env.publicUrl}${settings.logoUrl}` : undefined;
    const { ok, body } = await call("/payments", {
      method: "POST",
      body: JSON.stringify({
        tx_ref: payment.reference,
        amount: payment.amount,
        currency: payment.currency,
        redirect_url: returnUrl,
        payment_options: env.flutterwave.paymentOptions || DEFAULT_OPTIONS[payment.currency] || "card",
        customer: { email, name: order.customerName, phonenumber: order.customerPhone },
        customizations: { title: settings.name, description: `Order ${order.code}`, ...(logo ? { logo } : {}) },
        meta: { order_code: order.code },
        configurations: { session_duration: Math.min(env.paymentTimeoutMinutes, 1440), max_retry_attempt: 5 },
      }),
    });
    const link = body?.data?.link;
    if (!ok || body?.status !== "success" || typeof link !== "string" || !/^https?:\/\//.test(link)) {
      throw new ProviderError("Flutterwave did not return a checkout link", { status: body?.status, message: body?.message });
    }
    return { checkoutUrl: link, providerRef: null };
  },

  async verify(payment) {
    const path = payment.providerRef
      ? `/transactions/${encodeURIComponent(payment.providerRef)}/verify`
      : `/transactions/verify_by_reference?tx_ref=${encodeURIComponent(payment.reference)}`;
    const { ok, status, body } = await call(path);
    if (!ok) {
      // "No transaction was found for this id/tx_ref" = the customer hasn't paid yet.
      if (status === 400 || status === 404) return { status: "pending" };
      throw new ProviderError(`Flutterwave verify failed (${status})`);
    }
    const d = body?.data ?? {};
    return {
      status: mapStatus(d.status),
      amount: Number(d.amount),
      currency: String(d.currency ?? ""),
      reference: String(d.tx_ref ?? ""),
      providerRef: d.id !== undefined ? String(d.id) : null,
      method: d.payment_type ? String(d.payment_type) : null,
      reason: d.processor_response ? String(d.processor_response).slice(0, 200) : null,
      raw: { id: d.id, status: d.status, payment_type: d.payment_type, amount: d.amount, currency: d.currency, flw_ref: d.flw_ref },
    };
  },
};
