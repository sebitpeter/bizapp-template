import { useState, type FormEvent } from "react";
import { Star, X } from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api-error";

const inputCls = "focus-ring mt-2 w-full rounded-xl border border-brand-line-strong bg-brand-bg px-4 py-3 text-sm font-normal normal-case tracking-normal text-brand-ink outline-none";
const labelCls = "block text-xs font-bold uppercase tracking-[.1em] text-brand-primary";

/** Public review form. Reviews wait for staff approval; order code + phone marks them "verified". */
export function ReviewDialog({ products, onClose, onDone }: { products: Product[]; onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState({ customerName: "", quote: "", rating: 5, productName: "", orderCode: "", phone: "", website: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (form.quote.trim().length < 10) return setError("Please write at least a few words.");
    setPending(true);
    setError("");
    try {
      await api("POST", "/reviews", {
        customerName: form.customerName.trim(),
        quote: form.quote.trim(),
        rating: form.rating,
        productName: form.productName || undefined,
        orderCode: form.orderCode.trim() || undefined,
        phone: form.orderCode.trim() ? form.phone.trim() || undefined : undefined,
        website: form.website || undefined,
      });
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Couldn't send your review. Please try again."));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-brand-ink/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label="Write a review" onSubmit={submit} onClick={(e) => e.stopPropagation()} className="max-h-[94vh] w-full max-w-[500px] overflow-y-auto rounded-[28px] bg-brand-surface p-6 shadow-brand-lg sm:p-8" data-testid="form-review">
        <div className="flex items-start justify-between">
          <h2 className="serif text-3xl font-semibold">Write a review</h2>
          <button type="button" onClick={onClose} className="focus-ring rounded-full p-2 hover:bg-brand-line" aria-label="Close"><X size={20} /></button>
        </div>
        <div className="mt-6 space-y-4">
          <fieldset>
            <legend className={labelCls}>Rating</legend>
            <div className="mt-2 flex gap-1" role="radiogroup">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={form.rating === n} aria-label={`${n} star${n > 1 ? "s" : ""}`} onClick={() => set("rating", n)} className="focus-ring rounded p-0.5 text-brand-accent-strong" data-testid={`button-rating-${n}`}>
                  <Star size={26} fill={n <= form.rating ? "currentColor" : "none"} />
                </button>
              ))}
            </div>
          </fieldset>
          <label className={labelCls}>Your name
            <input value={form.customerName} onChange={(e) => set("customerName", e.target.value)} required maxLength={60} className={inputCls} autoComplete="name" data-testid="input-review-name" />
          </label>
          {products.length > 0 && (
            <label className={labelCls}>What did you get? <span className="font-normal normal-case tracking-normal text-brand-muted">optional</span>
              <select value={form.productName} onChange={(e) => set("productName", e.target.value)} className={inputCls}>
                <option value="">—</option>
                {products.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
              </select>
            </label>
          )}
          <label className={labelCls}>Your review
            <textarea value={form.quote} onChange={(e) => set("quote", e.target.value)} required minLength={10} maxLength={800} className={`${inputCls} min-h-24 resize-none`} data-testid="input-review-quote" />
          </label>
          <details className="rounded-xl bg-brand-bg px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold">Ordered from us? Get a “verified” badge</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className={labelCls}>Order code<input value={form.orderCode} onChange={(e) => set("orderCode", e.target.value.toUpperCase())} maxLength={20} className={inputCls} /></label>
              <label className={labelCls}>Phone<input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} maxLength={30} className={inputCls} /></label>
            </div>
          </details>
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={form.website} onChange={(e) => set("website", e.target.value)} />
        </div>
        <p className="mt-4 text-[11px] text-brand-muted">Reviews are checked by our team before they appear.</p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
        <button disabled={pending} className="focus-ring mt-5 w-full rounded-full bg-brand-primary py-4 text-sm font-bold text-brand-on-primary disabled:opacity-60" data-testid="button-submit-review">{pending ? "Sending…" : "Send review"}</button>
      </form>
    </div>
  );
}
