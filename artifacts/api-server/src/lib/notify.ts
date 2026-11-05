import type { Order, OrderLine } from "@workspace/db";
import { businessConfig, type SiteSettings } from "@workspace/business";
import { env, isProduction } from "./env";
import { logger } from "./logger";
import { formatMoney } from "./money";

/**
 * Order notifications.
 *  - Email via any SMTP server (Gmail app password, Zoho, Brevo, Mailgun...): SMTP_* env vars.
 *  - SMS via Africa's Talking (works across East/West Africa): AT_* env vars.
 *    AT_USERNAME=sandbox uses their free simulator.
 *  - Nothing configured: printed to the server console in development,
 *    silently skipped in production.
 * Sending never blocks or fails an order: errors are logged only.
 */
type Mail = { to: string; subject: string; text: string };
type Sms = { to: string; message: string };

let transporter: import("nodemailer").Transporter | null = null;
async function mailer() {
  if (!env.smtp.host) return null;
  if (!transporter) {
    const nodemailer = await import("nodemailer");
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export const notifyChannels = () => ({
  email: env.smtp.host ? "smtp" : isProduction ? "off" : "console",
  sms: env.sms.username && env.sms.apiKey ? (env.sms.username === "sandbox" ? "africastalking-sandbox" : "africastalking") : isProduction ? "off" : "console",
});

export async function sendEmail(mail: Mail): Promise<void> {
  if (!mail.to) return;
  try {
    const t = await mailer();
    if (!t) {
      if (!isProduction) logger.info({ channel: "email", to: mail.to, subject: mail.subject }, `[dev email]\n${mail.text}`);
      return;
    }
    await t.sendMail({ from: env.smtp.from || env.smtp.user, to: mail.to, subject: mail.subject, text: mail.text });
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "Email failed");
  }
}

export async function sendSms(sms: Sms): Promise<void> {
  if (!sms.to) return;
  try {
    if (!env.sms.username || !env.sms.apiKey) {
      if (!isProduction) logger.info({ channel: "sms", to: sms.to }, `[dev sms] ${sms.message}`);
      return;
    }
    const base = env.sms.username === "sandbox" ? "https://api.sandbox.africastalking.com" : "https://api.africastalking.com";
    const body = new URLSearchParams({ username: env.sms.username, to: sms.to, message: sms.message.slice(0, 459) });
    if (env.sms.senderId) body.set("from", env.sms.senderId);
    const res = await fetch(`${base}/version1/messaging`, {
      method: "POST",
      headers: { apiKey: env.sms.apiKey, Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) logger.warn({ status: res.status }, "SMS failed");
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "SMS failed");
  }
}

const money = (o: Order, s: SiteSettings, v: number) => formatMoney(v, o.currency, s.currency.locale);
const lines = (o: Order, s: SiteSettings) => (o.items as OrderLine[]).map((l) => `  ${l.quantity} × ${l.name} — ${money(o, s, l.quantity * l.unitPrice)}`).join("\n");
const trackUrl = (o: Order) => `${env.publicUrl}/track?code=${encodeURIComponent(o.code ?? "")}`;

type Event = "placed" | "paid" | "status";

/** Fire-and-forget: tells the customer and the shop what happened. */
export function notifyOrder(event: Event, order: Order, settings: SiteSettings): void {
  void (async () => {
    const label = (businessConfig.statusLabels as Record<string, string>)[order.status] ?? order.status;
    const shop = settings.name;
    const how = order.fulfillment === "pickup" ? `Pickup at ${settings.checkout.pickup.address || settings.contact.address}` : `Delivery to ${order.deliveryZone ?? ""}: ${order.deliveryAddress ?? ""}`;
    const summary = `Order ${order.code}\n${lines(order, settings)}\nDelivery fee: ${money(order, settings, order.deliveryFee)}\nTotal: ${money(order, settings, order.total)}\n${how}\nPayment: ${order.paymentMethod === "cod" ? "cash / pay on delivery or pickup" : order.paymentStatus}`;
    let customerSubject: string, customerText: string, sms: string, shopText: string | null;
    if (event === "placed") {
      customerSubject = `${shop}: we received order ${order.code}`;
      customerText = `Hi ${order.customerName},\n\nThanks for your order!\n\n${summary}\n\nTrack it: ${trackUrl(order)}\n\n${shop}`;
      sms = `${shop}: order ${order.code} received, total ${money(order, settings, order.total)}. Track: ${trackUrl(order)}`;
      shopText = `New order ${order.code} from ${order.customerName} (${order.customerPhone})\n\n${summary}\nNote: ${order.deliveryNote ?? "-"}`;
    } else if (event === "paid") {
      customerSubject = `${shop}: payment received for ${order.code}`;
      customerText = `Hi ${order.customerName},\n\nWe received your payment of ${money(order, settings, order.total)} for order ${order.code}.\n\nTrack it: ${trackUrl(order)}\n\n${shop}`;
      sms = `${shop}: payment of ${money(order, settings, order.total)} received for ${order.code}. Thank you!`;
      shopText = `Order ${order.code} is PAID (${money(order, settings, order.total)}).`;
    } else {
      customerSubject = `${shop}: order ${order.code} is now ${label}`;
      customerText = `Hi ${order.customerName},\n\nYour order ${order.code} is now: ${label}.\n\nTrack it: ${trackUrl(order)}\n\n${shop}`;
      sms = `${shop}: order ${order.code} is now ${label}.`;
      shopText = null;
    }
    await Promise.all([
      order.customerEmail ? sendEmail({ to: order.customerEmail, subject: customerSubject, text: customerText }) : null,
      order.customerPhone ? sendSms({ to: order.customerPhone, message: sms }) : null,
      shopText && env.notify.shopEmail ? sendEmail({ to: env.notify.shopEmail, subject: `[${shop}] ${customerSubject.replace(`${shop}: `, "")}`, text: shopText }) : null,
      shopText && env.notify.shopPhone ? sendSms({ to: env.notify.shopPhone, message: shopText.split("\n")[0] }) : null,
    ]);
  })();
}
