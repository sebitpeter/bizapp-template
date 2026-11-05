import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, Check, CircleAlert, Clock3, CreditCard, Loader2, PackageCheck, RefreshCw } from "lucide-react";
import { Link, useLocation, useParams } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { BrandLogo } from "@/components/brand-logo";
import { api, orderToken, type TrackedOrder } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";
import { useMoney } from "@/lib/theme";

const inputCls = "focus-ring mt-2 w-full rounded-xl border border-brand-line-strong bg-brand-bg px-4 py-3 text-sm text-brand-ink outline-none";

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-[100dvh] bg-brand-bg text-brand-ink">
      <header className="border-b border-brand-line/80 bg-brand-bg/90">
        <div className="mx-auto flex max-w-[860px] items-center justify-between px-5 py-4">
          <BrandLogo />
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-primary" data-testid="link-back-shop"><ArrowLeft size={15} /> Back to shop</Link>
        </div>
      </header>
      <main className="mx-auto max-w-[860px] px-5 py-10">{children}</main>
    </div>
  );
}

const STEPS_DELIVERY = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Completed"];
const STEPS_PICKUP = ["Pending", "Confirmed", "Preparing", "Ready for Pickup", "Completed"];
const fmtDate = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function PaymentBanner({ order, onPay, paying, onRefresh, refreshing }: { order: TrackedOrder; onPay: () => void; paying: boolean; onRefresh: () => void; refreshing: boolean }) {
  const money = useMoney();
  if (order.paymentMethod === "cod") {
    return order.paymentStatus === "paid"
      ? <Banner tone="ok" icon={<Check size={18} />} title="Paid — thank you!" />
      : <Banner tone="info" icon={<Clock3 size={18} />} title={`Pay ${money(order.total)} ${order.fulfillment === "pickup" ? "when you pick up" : "on delivery"}`} body="Cash or mobile money to our staff." />;
  }
  if (order.paymentStatus === "paid") return <Banner tone="ok" icon={<Check size={18} />} title="Payment received" body={order.paidAt ? `Confirmed ${fmtDate(order.paidAt)}` : undefined} />;
  if (order.paymentStatus === "refunded") return <Banner tone="info" icon={<RefreshCw size={18} />} title="This order was refunded" />;
  return (
    <Banner
      tone={order.paymentStatus === "failed" ? "bad" : "warn"}
      icon={order.paymentStatus === "failed" ? <CircleAlert size={18} /> : <Clock3 size={18} />}
      title={order.paymentStatus === "failed" ? "The payment didn't go through" : "Waiting for your payment"}
      body={order.paymentStatus === "failed" ? "No money was taken for this attempt. You can try again." : "If you've just paid, it can take a minute to confirm. We check with the payment provider — never the link you came back on."}
    >
      <div className="mt-3 flex flex-wrap gap-2">
        {order.canRetryPayment && (
          <button onClick={onPay} disabled={paying} className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand-primary px-4 py-2.5 text-xs font-bold text-brand-on-primary disabled:opacity-60" data-testid="button-pay-now">
            {paying ? <Loader2 size={14} className="animate-spin" /> : <CreditCard size={14} />} Pay {money(order.total)} now
          </button>
        )}
        <button onClick={onRefresh} disabled={refreshing} className="focus-ring inline-flex items-center gap-2 rounded-full border border-brand-line-strong px-4 py-2.5 text-xs font-bold" data-testid="button-refresh-order">
          <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} /> Check again
        </button>
      </div>
    </Banner>
  );
}

function Banner({ tone, icon, title, body, children }: { tone: "ok" | "info" | "warn" | "bad"; icon: ReactNode; title: string; body?: string; children?: ReactNode }) {
  const cls = { ok: "bg-emerald-50 text-emerald-900 border-emerald-200", info: "bg-sky-50 text-sky-900 border-sky-200", warn: "bg-amber-50 text-amber-900 border-amber-200", bad: "bg-red-50 text-red-900 border-red-200" }[tone];
  return (
    <div className={`rounded-2xl border px-5 py-4 ${cls}`} role="status" data-testid={`banner-payment-${tone}`}>
      <p className="flex items-center gap-2 font-bold">{icon} {title}</p>
      {body && <p className="mt-1 text-sm opacity-90">{body}</p>}
      {children}
    </div>
  );
}

function OrderView({ order, onPay, paying, onRefresh, refreshing, payError }: { order: TrackedOrder; onPay: () => void; paying: boolean; onRefresh: () => void; refreshing: boolean; payError: string }) {
  const money = useMoney();
  const steps = order.fulfillment === "pickup" ? STEPS_PICKUP : STEPS_DELIVERY;
  const current = steps.indexOf(order.status);
  const cancelled = order.status === "Cancelled";
  return (
    <div className="space-y-6" data-testid="view-order">
      <div>
        <p className="mono text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">Order</p>
        <h1 className="serif text-4xl font-semibold tracking-[-.04em]" data-testid="text-order-code">{order.code}</h1>
        <p className="mt-1 text-sm text-brand-muted-strong">Thanks, {order.customerName.split(" ")[0]}! Placed {fmtDate(order.createdAt)}. Keep this code — you'll need it with your phone number to track the order.</p>
      </div>
      <PaymentBanner order={order} onPay={onPay} paying={paying} onRefresh={onRefresh} refreshing={refreshing} />
      {payError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{payError}</p>}

      <section className="rounded-[22px] border border-brand-line bg-brand-surface p-6">
        <h2 className="mb-4 font-bold">Status</h2>
        {cancelled ? (
          <p className="font-semibold text-red-800" data-testid="text-order-status">Cancelled</p>
        ) : (
          <ol className="grid gap-3 sm:grid-cols-5" data-testid="text-order-status" data-status={order.status}>
            {steps.map((s, i) => (
              <li key={s} className={`flex items-center gap-2 text-xs font-semibold sm:flex-col sm:text-center ${i <= current ? "text-brand-primary" : "text-brand-muted"}`}>
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border-2 ${i < current ? "border-brand-primary bg-brand-primary text-brand-on-primary" : i === current ? "border-brand-primary" : "border-brand-line-strong"}`}>
                  {i < current ? <Check size={14} /> : i === current ? <PackageCheck size={14} /> : null}
                </span>
                {s}
              </li>
            ))}
          </ol>
        )}
        <p className="mt-4 text-sm text-brand-muted-strong">
          {order.fulfillment === "pickup" ? <>Pickup at <strong>{order.pickupAddress || "the shop"}</strong></> : <>Delivery{order.deliveryZone ? <> to <strong>{order.deliveryZone}</strong></> : null}</>}
        </p>
      </section>

      <section className="rounded-[22px] border border-brand-line bg-brand-surface p-6">
        <h2 className="mb-4 font-bold">Items</h2>
        <ul className="divide-y divide-brand-line text-sm">
          {order.items.map((it) => (
            <li key={it.productId} className="flex justify-between py-2"><span>{it.quantity} × {it.name}</span><span className="mono">{money(it.unitPrice * it.quantity)}</span></li>
          ))}
        </ul>
        <dl className="mt-3 space-y-1 border-t border-brand-line pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-brand-muted-strong">Subtotal</dt><dd className="mono">{money(order.subtotal)}</dd></div>
          {order.fulfillment === "delivery" && <div className="flex justify-between"><dt className="text-brand-muted-strong">Delivery</dt><dd className="mono">{order.deliveryFee ? money(order.deliveryFee) : "Free"}</dd></div>}
          <div className="flex justify-between text-base font-bold"><dt>Total</dt><dd className="mono" data-testid="text-order-total">{money(order.total)}</dd></div>
        </dl>
      </section>

      {order.history.length > 0 && (
        <section className="rounded-[22px] border border-brand-line bg-brand-surface p-6">
          <h2 className="mb-3 font-bold">Updates</h2>
          <ul className="space-y-1.5 text-sm">
            {[...order.history].reverse().map((h, i) => (
              <li key={i} className="flex gap-3"><span className="w-40 shrink-0 text-brand-muted">{fmtDate(h.at)}</span><span>{h.type === "payment" ? `Payment ${h.value}` : `Status: ${h.value}`}</span></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

/** Shared loader: code + (saved token | phone). */
function useOrder(code: string, phone: string | null) {
  const token = orderToken(code);
  const enabled = !!code && (!!token || !!phone);
  const query = useQuery({
    queryKey: ["track", code, phone ?? "token"],
    queryFn: () => api<TrackedOrder>("POST", "/orders/track", token ? { code, token } : { code, phone }),
    enabled,
    retry: false,
    // While an online payment is pending, re-check every 6s for 2 minutes.
    refetchInterval: (q) => {
      const d = q.state.data;
      return d && d.paymentMethod !== "cod" && d.paymentStatus === "pending" && q.state.dataUpdateCount < 20 ? 6000 : false;
    },
  });
  const pay = useMutation({
    mutationFn: () => api<{ checkoutUrl: string }>("POST", "/orders/pay", token ? { code, token } : { code, phone }),
    onSuccess: (r) => {
      // Only real web links (never javascript: etc.). The URL comes from our own server.
      if (/^https?:\/\//.test(r.checkoutUrl)) window.location.assign(r.checkoutUrl);
    },
  });
  return { query, pay, needsPhone: !token && !phone };
}

export function OrderPage() {
  const { code = "" } = useParams<{ code: string }>();
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneInput, setPhoneInput] = useState("");
  const { query, pay, needsPhone } = useOrder(code.toUpperCase(), phone);

  return (
    <Shell>
      {needsPhone ? (
        <PhoneGate code={code} value={phoneInput} onChange={setPhoneInput} onSubmit={() => setPhone(phoneInput.trim())} />
      ) : query.isLoading ? (
        <div className="grid place-items-center py-20 text-brand-muted"><Loader2 className="animate-spin" /></div>
      ) : query.isError ? (
        <div className="space-y-4">
          <Banner tone="bad" icon={<CircleAlert size={18} />} title="We couldn't find that order" body={errorMessage(query.error)} />
          <PhoneGate code={code} value={phoneInput} onChange={setPhoneInput} onSubmit={() => setPhone(phoneInput.trim())} />
        </div>
      ) : query.data ? (
        <OrderView order={query.data} onPay={() => pay.mutate()} paying={pay.isPending} onRefresh={() => query.refetch()} refreshing={query.isFetching} payError={pay.isError ? errorMessage(pay.error) : ""} />
      ) : null}
    </Shell>
  );
}

function PhoneGate({ code, value, onChange, onSubmit }: { code: string; value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  return (
    <form onSubmit={(e) => { e.preventDefault(); if (value.trim()) onSubmit(); }} className="max-w-md rounded-[22px] border border-brand-line bg-brand-surface p-6">
      <h1 className="serif text-3xl font-semibold">Order {code.toUpperCase()}</h1>
      <p className="mt-1 text-sm text-brand-muted-strong">Enter the phone number you used for this order.</p>
      <label className="mt-4 block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Phone
        <input type="tel" value={value} onChange={(e) => onChange(e.target.value)} required maxLength={30} className={inputCls} autoComplete="tel" data-testid="input-gate-phone" />
      </label>
      <button className="focus-ring mt-4 w-full rounded-full bg-brand-primary py-3 text-sm font-bold text-brand-on-primary" data-testid="button-gate-submit">Show my order</button>
    </form>
  );
}

export function TrackPage() {
  const initial = new URLSearchParams(window.location.search).get("code") ?? "";
  const [code, setCode] = useState(initial.toUpperCase().slice(0, 20));
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState<{ code: string; phone: string } | null>(null);
  const { query, pay } = useOrder(submitted?.code ?? "", submitted?.phone ?? null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (code.trim().length >= 4 && phone.trim()) setSubmitted({ code: code.trim().toUpperCase(), phone: phone.trim() });
  };

  return (
    <Shell>
      <form onSubmit={submit} className="mb-8 rounded-[22px] border border-brand-line bg-brand-surface p-6" data-testid="form-track">
        <h1 className="serif text-4xl font-semibold tracking-[-.04em]">Track your order</h1>
        <p className="mt-1 text-sm text-brand-muted-strong">Use the order code from your confirmation and the phone number you ordered with.</p>
        <div className="mt-5 grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Order code
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} required minLength={4} maxLength={20} placeholder="e.g. K7M2Q9" className={inputCls} data-testid="input-track-code" />
          </label>
          <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Phone
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} required maxLength={30} className={inputCls} autoComplete="tel" data-testid="input-track-phone" />
          </label>
          <button className="focus-ring rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-brand-on-primary" data-testid="button-track">{query.isFetching ? "Checking…" : "Track"}</button>
        </div>
      </form>
      {query.isError && <Banner tone="bad" icon={<CircleAlert size={18} />} title="Not found" body={errorMessage(query.error)} />}
      {query.data && <OrderView order={query.data} onPay={() => pay.mutate()} paying={pay.isPending} onRefresh={() => query.refetch()} refreshing={query.isFetching} payError={pay.isError ? errorMessage(pay.error) : ""} />}
    </Shell>
  );
}

export function UnsubscribePage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [, navigate] = useLocation();
  const m = useMutation({ mutationFn: () => api<{ ok: boolean }>("POST", "/newsletter/unsubscribe", { token }) });
  useEffect(() => {
    if (!token) navigate("/");
  }, [token, navigate]);
  return (
    <Shell>
      <div className="mx-auto max-w-md rounded-[22px] border border-brand-line bg-brand-surface p-8 text-center" data-testid="page-unsubscribe">
        {m.isSuccess ? (
          <>
            <Check className="mx-auto mb-3 text-emerald-700" />
            <h1 className="serif text-3xl font-semibold">You're unsubscribed</h1>
            <p className="mt-2 text-sm text-brand-muted-strong">You won't get any more newsletter emails from us. Order emails still arrive if you place an order.</p>
          </>
        ) : (
          <>
            <h1 className="serif text-3xl font-semibold">Unsubscribe from the newsletter?</h1>
            <p className="mt-2 text-sm text-brand-muted-strong">Click the button to stop newsletter emails.</p>
            {m.isError && <p role="alert" className="mt-3 text-sm text-red-800">{errorMessage(m.error, "That link is invalid or expired.")}</p>}
            <button onClick={() => m.mutate()} disabled={m.isPending} className="focus-ring mt-5 rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-brand-on-primary disabled:opacity-60" data-testid="button-unsubscribe">{m.isPending ? "Working…" : "Unsubscribe"}</button>
          </>
        )}
      </div>
    </Shell>
  );
}
