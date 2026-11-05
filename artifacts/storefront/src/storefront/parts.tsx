import type { FormEvent } from "react";
import { ArrowRight, Bike, Heart, Lock, Minus, Plus, ShoppingBag, Sparkles, Star, Store, X } from "lucide-react";
import type { CheckoutSettings, Product, Review } from "@workspace/api-client-react";
import { copy } from "@/lib/business";
import { useMoney, useSettings } from "@/lib/theme";

export type CartLine = { product: Product; quantity: number };
export type CheckoutForm = {
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  fulfillment: "delivery" | "pickup";
  deliveryZoneId: string;
  deliveryAddress: string;
  deliveryNote: string;
  paymentMethod: string;
  website: string; // honeypot, stays empty for humans
};
export type CheckoutMethod = { id: "cod" | "flutterwave" | "pesapal"; label: string; description: string; test?: boolean };

/** Units a customer may still add: stock if tracked (null = not tracked), capped per line. */
export const maxQty = (p: Product) => Math.max(0, Math.min(50, p.stock == null ? 50 : p.stock));
export const isSoldOut = (p: Product) => !p.available || p.stock === 0;

export function ProductArt({ product, className = "" }: { product: Product; className?: string }) {
  const { heroImageUrl } = useSettings();
  const fallback = heroImageUrl || "/hero.png";
  return (
    <div className={`relative overflow-hidden rounded-[20px] bg-brand-line ${className}`}>
      <img
        src={product.imageUrl || fallback}
        alt={product.name}
        loading="lazy"
        className="h-full w-full object-cover transition duration-700 group-hover:scale-105"
        onError={(event) => {
          if (event.currentTarget.src !== new URL(fallback, location.href).href) event.currentTarget.src = fallback;
        }}
        data-testid={`img-product-${product.id}`}
      />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-brand-ink/30 via-transparent to-transparent" />
      <span className="absolute left-3 top-3 rounded-full bg-brand-surface/90 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[.12em] text-brand-primary backdrop-blur">
        {product.tags?.[0] || product.category}
      </span>
    </div>
  );
}

function Rating({ rating, count }: { rating: number; count?: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary" data-testid="text-product-rating">
      <Star size={13} fill="currentColor" /> {rating.toFixed(1)} {count ? <span className="font-normal text-brand-muted">({count})</span> : null}
    </span>
  );
}

export function ProductCard({ product, favorite, onFavorite, onAdd, index }: { product: Product; favorite: boolean; onFavorite: () => void; onAdd: () => void; index: number }) {
  const money = useMoney();
  return (
    <article className={`group animate-rise-in delay-${Math.min(index + 1, 4)} overflow-hidden rounded-[24px] border border-brand-line bg-brand-surface p-2 transition duration-300 hover:-translate-y-1 hover:shadow-brand`} data-testid={`card-product-${product.id}`}>
      <div className="relative">
        <ProductArt product={product} className="aspect-[1.15/1]" />
        <button onClick={onFavorite} className={`focus-ring absolute right-3 top-3 grid h-9 w-9 place-items-center rounded-full backdrop-blur transition ${favorite ? "bg-brand-surface text-brand-accent-strong" : "bg-brand-surface/75 text-brand-primary hover:bg-brand-surface"}`} aria-label={favorite ? `Remove ${product.name} from favorites` : `Favorite ${product.name}`} aria-pressed={favorite} data-testid={`button-favorite-${product.id}`}>
          <Heart size={16} fill={favorite ? "currentColor" : "none"} />
        </button>
      </div>
      <div className="px-3 pb-3 pt-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="serif text-[22px] font-semibold leading-none tracking-[-.03em]" data-testid={`text-product-name-${product.id}`}>{product.name}</h3>
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-brand-muted-strong">{product.description}</p>
          </div>
          <span className="mono shrink-0 pt-1 text-sm font-bold text-brand-primary" data-testid={`text-product-price-${product.id}`}>{money(product.price)}</span>
        </div>
        <div className="mt-4 flex items-center justify-between">
          <Rating rating={product.rating} count={product.reviewCount} />
          {!isSoldOut(product) && product.stock != null && product.stock <= 5 && <span className="text-[11px] font-semibold text-brand-accent-strong" data-testid={`text-low-stock-${product.id}`}>Only {product.stock} left</span>}
          <button onClick={onAdd} disabled={isSoldOut(product)} className="focus-ring inline-flex items-center gap-1.5 rounded-full bg-brand-primary px-3.5 py-2 text-xs font-bold text-brand-on-primary transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:bg-brand-line-strong" data-testid={`button-add-product-${product.id}`}>
            {isSoldOut(product) ? "Sold out" : <><Plus size={15} /> Add</>}
          </button>
        </div>
      </div>
    </article>
  );
}

export function ReviewCard({ review, index }: { review: Review; index: number }) {
  return (
    <article className={`animate-rise-in delay-${index + 1} rounded-[22px] border border-brand-line bg-brand-surface p-6`} data-testid={`card-review-${review.id}`}>
      <div className="mb-7 flex items-center justify-between">
        <span className="flex gap-0.5 text-brand-accent-strong" aria-label={`${review.rating} out of 5 stars`}>
          {Array.from({ length: review.rating }).map((_, star) => <Star key={star} size={14} fill="currentColor" />)}
        </span>
        {review.verified && <span className="text-[10px] font-bold uppercase tracking-[.1em] text-[#5f7a3a]">{copy.reviews.verified}</span>}
      </div>
      <p className="serif min-h-[80px] text-[24px] leading-[1.05] tracking-[-.03em] text-brand-ink">“{review.quote}”</p>
      <div className="mt-6 flex items-center justify-between gap-3 text-xs">
        <span className="font-bold">{review.customerName}</span>
        <span className="truncate text-brand-muted">{review.productName}</span>
      </div>
    </article>
  );
}

export function ProductSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading products">
      {[1, 2, 3].map((item) => (
        <div key={item} className="animate-pulse rounded-[24px] bg-brand-surface p-2">
          <div className="aspect-[1.15/1] rounded-[20px] bg-brand-line" />
          <div className="space-y-3 p-4">
            <div className="h-6 w-2/3 rounded bg-brand-line" />
            <div className="h-3 w-full rounded bg-brand-line" />
            <div className="h-9 w-24 rounded-full bg-brand-line" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action, onAction }: { title: string; body: string; action: string; onAction: () => void }) {
  return (
    <div className="rounded-[26px] border border-dashed border-brand-line-strong bg-brand-surface/60 px-6 py-16 text-center">
      <Sparkles className="mx-auto mb-4 text-brand-accent-strong" />
      <h3 className="serif text-3xl font-semibold">{title}</h3>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-brand-muted-strong">{body}</p>
      <button onClick={onAction} className="focus-ring mt-6 rounded-full bg-brand-primary px-5 py-3 text-xs font-bold text-brand-on-primary" data-testid="button-empty-action">{action}</button>
    </div>
  );
}

export function CartDrawer({ cart, total, onClose, onChange, onCheckout }: { cart: CartLine[]; total: number; onClose: () => void; onChange: (id: number, delta: number) => void; onCheckout: () => void }) {
  const money = useMoney();
  return (
    <div className="fixed inset-0 z-[60] bg-brand-ink/35 backdrop-blur-sm" onClick={onClose}>
      <aside role="dialog" aria-modal="true" aria-label={copy.cart.eyebrow} className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col bg-brand-surface p-6 shadow-brand-lg sm:p-8" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">{copy.cart.eyebrow}</p>
            <h2 className="serif mt-1 text-3xl font-semibold">{copy.cart.title}</h2>
          </div>
          <button onClick={onClose} className="focus-ring rounded-full p-2 transition hover:bg-brand-line" aria-label="Close cart" data-testid="button-close-cart"><X size={21} /></button>
        </div>
        {cart.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <ShoppingBag size={34} className="mb-4 text-brand-accent-strong" />
            <h3 className="serif text-2xl font-semibold">{copy.cart.emptyTitle}</h3>
            <p className="mt-2 max-w-[240px] text-sm leading-6 text-brand-muted-strong">{copy.cart.emptyBody}</p>
            <button onClick={onClose} className="focus-ring mt-6 rounded-full bg-brand-primary px-5 py-3 text-xs font-bold text-brand-on-primary" data-testid="button-browse-from-cart">Keep browsing</button>
          </div>
        ) : (
          <>
            <div className="mt-8 flex-1 space-y-4 overflow-y-auto">
              {cart.map(({ product, quantity }) => (
                <div key={product.id} className="flex gap-3 border-b border-brand-line pb-4" data-testid={`cart-item-${product.id}`}>
                  <ProductArt product={product} className="h-20 w-20 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <h3 className="serif truncate text-lg font-semibold">{product.name}</h3>
                    <span className="mono text-xs text-brand-primary">{money(product.price)}</span>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => onChange(product.id, -1)} className="focus-ring grid h-6 w-6 place-items-center rounded-full border border-brand-line-strong" aria-label={`Decrease ${product.name}`} data-testid={`button-decrease-${product.id}`}><Minus size={12} /></button>
                      <span className="mono text-xs" aria-live="polite">{quantity}</span>
                      <button onClick={() => onChange(product.id, 1)} disabled={quantity >= maxQty(product)} className="focus-ring grid h-6 w-6 place-items-center rounded-full border border-brand-line-strong disabled:opacity-40" aria-label={`Increase ${product.name}`} data-testid={`button-increase-${product.id}`}><Plus size={12} /></button>
                    </div>
                  </div>
                  <span className="mono text-sm font-bold">{money(product.price * quantity)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-line pt-5">
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm text-brand-muted-strong">Subtotal</span>
                <span className="mono text-lg font-bold">{money(total)}</span>
              </div>
              <button onClick={onCheckout} className="focus-ring flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary py-4 text-sm font-bold text-brand-on-primary transition hover:bg-brand-primary-hover" data-testid="button-checkout">{copy.cart.checkout} <ArrowRight size={16} /></button>
              <p className="mt-3 text-center text-[10px] text-brand-muted">{copy.cart.footnote}</p>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

const inputCls = "focus-ring mt-2 w-full rounded-xl border border-brand-line-strong bg-brand-bg px-4 py-3 text-sm font-normal normal-case tracking-normal text-brand-ink outline-none";

const radioCls = (on: boolean) =>
  `focus-ring flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition ${on ? "border-brand-primary bg-brand-bg ring-1 ring-brand-primary" : "border-brand-line-strong hover:border-brand-primary/60"}`;

export function deliveryFeeFor(checkout: CheckoutSettings, form: Pick<CheckoutForm, "fulfillment" | "deliveryZoneId">, subtotal: number): number {
  if (form.fulfillment !== "delivery") return 0;
  const zone = checkout.delivery.zones.find((z) => z.id === form.deliveryZoneId);
  if (!zone) return 0;
  return checkout.delivery.freeOver > 0 && subtotal >= checkout.delivery.freeOver ? 0 : zone.fee;
}

export function CheckoutDialog({ checkout, setCheckout, settings, methods, methodsLoading, pending, error, onClose, onSubmit, subtotal }: {
  checkout: CheckoutForm; setCheckout: (value: CheckoutForm) => void; settings: CheckoutSettings; methods: CheckoutMethod[]; methodsLoading: boolean;
  pending: boolean; error: string; onClose: () => void; onSubmit: (event: FormEvent) => void; subtotal: number;
}) {
  const money = useMoney();
  const update = <K extends keyof CheckoutForm>(key: K, value: CheckoutForm[K]) => setCheckout({ ...checkout, [key]: value });
  const fee = deliveryFeeFor(settings, checkout, subtotal);
  const total = subtotal + fee;
  const belowMin = settings.minOrder > 0 && subtotal < settings.minOrder;
  const chosen = methods.find((m) => m.id === checkout.paymentMethod);
  const online = chosen && chosen.id !== "cod";
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-brand-ink/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <form role="dialog" aria-modal="true" aria-label={copy.checkout.title} onSubmit={onSubmit} onClick={(event) => event.stopPropagation()} className="max-h-[94vh] w-full max-w-[540px] overflow-y-auto rounded-[28px] bg-brand-surface p-6 shadow-brand-lg sm:p-8" data-testid="form-checkout">
        <div className="flex items-start justify-between">
          <div>
            <p className="mono text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">{copy.checkout.eyebrow}</p>
            <h2 className="serif mt-1 text-3xl font-semibold">{copy.checkout.title}</h2>
          </div>
          <button type="button" onClick={onClose} className="focus-ring rounded-full p-2 hover:bg-brand-line" aria-label="Close checkout" data-testid="button-close-checkout"><X size={20} /></button>
        </div>
        <div className="mt-7 space-y-4">
          <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Your name
            <input value={checkout.customerName} onChange={(e) => update("customerName", e.target.value)} className={inputCls} required maxLength={100} autoComplete="name" data-testid="input-checkout-name" />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Phone
              <input type="tel" inputMode="tel" value={checkout.customerPhone} onChange={(e) => update("customerPhone", e.target.value)} placeholder={settings.phoneCountryCode === "256" ? "0772 123456" : settings.phoneCountryCode ? "Your phone number" : "+256 772 123456"} className={inputCls} required maxLength={30} autoComplete="tel" data-testid="input-checkout-phone" />
            </label>
            <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Email <span className="font-normal normal-case tracking-normal text-brand-muted">optional</span>
              <input type="email" value={checkout.customerEmail} onChange={(e) => update("customerEmail", e.target.value)} className={inputCls} maxLength={254} autoComplete="email" data-testid="input-checkout-email" />
            </label>
          </div>
          <p className="-mt-2 text-[11px] text-brand-muted">We use your phone to confirm the order and you'll need it to track it.</p>

          {settings.delivery.enabled && settings.pickup.enabled && (
            <fieldset className="grid gap-2 sm:grid-cols-2">
              <legend className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-brand-primary">How do you want it?</legend>
              <label className={radioCls(checkout.fulfillment === "delivery")}>
                <input type="radio" name="fulfillment" className="mt-1 accent-current" checked={checkout.fulfillment === "delivery"} onChange={() => update("fulfillment", "delivery")} data-testid="radio-delivery" />
                <span><span className="flex items-center gap-1.5 font-bold"><Bike size={15} /> Delivery</span></span>
              </label>
              <label className={radioCls(checkout.fulfillment === "pickup")}>
                <input type="radio" name="fulfillment" className="mt-1" checked={checkout.fulfillment === "pickup"} onChange={() => update("fulfillment", "pickup")} data-testid="radio-pickup" />
                <span><span className="flex items-center gap-1.5 font-bold"><Store size={15} /> Pickup</span><span className="block text-xs text-brand-muted">Free</span></span>
              </label>
            </fieldset>
          )}

          {checkout.fulfillment === "delivery" ? (
            <>
              <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Delivery area
                <select value={checkout.deliveryZoneId} onChange={(e) => update("deliveryZoneId", e.target.value)} className={inputCls} required data-testid="select-checkout-zone">
                  <option value="">Choose your area…</option>
                  {settings.delivery.zones.map((z) => <option key={z.id} value={z.id}>{z.name} — {z.fee ? money(z.fee) : "free"}</option>)}
                </select>
              </label>
              <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Address / directions
                <input value={checkout.deliveryAddress} onChange={(e) => update("deliveryAddress", e.target.value)} placeholder="Street, building, landmark" className={inputCls} required maxLength={300} autoComplete="street-address" data-testid="input-checkout-address" />
              </label>
              {(settings.delivery.note || settings.delivery.freeOver > 0) && (
                <p className="-mt-2 text-[11px] text-brand-muted">{settings.delivery.note}{settings.delivery.note && settings.delivery.freeOver > 0 ? " · " : ""}{settings.delivery.freeOver > 0 ? `Free delivery from ${money(settings.delivery.freeOver)}` : ""}</p>
              )}
            </>
          ) : (
            <div className="rounded-xl bg-brand-bg px-4 py-3 text-sm" data-testid="text-pickup-address">
              <p className="font-bold">Pick up at</p>
              <p className="text-brand-muted-strong">{settings.pickup.address || "the shop"}</p>
              {settings.pickup.note && <p className="mt-1 text-xs text-brand-muted">{settings.pickup.note}</p>}
            </div>
          )}

          <label className="block text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Note <span className="font-normal normal-case tracking-normal text-brand-muted">optional</span>
            <textarea value={checkout.deliveryNote} onChange={(e) => update("deliveryNote", e.target.value)} placeholder={copy.checkout.notePlaceholder} maxLength={500} className={`${inputCls} min-h-16 resize-none`} data-testid="input-checkout-note" />
          </label>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-xs font-bold uppercase tracking-[.1em] text-brand-primary">Payment</legend>
            {methodsLoading ? (
              <div className="h-14 animate-pulse rounded-xl bg-brand-line" />
            ) : methods.length === 0 ? (
              <p className="text-sm text-red-800">Ordering online isn't available right now. Please call us.</p>
            ) : (
              methods.map((m) => (
                <label key={m.id} className={radioCls(checkout.paymentMethod === m.id)} data-testid={`radio-pay-${m.id}`}>
                  <input type="radio" name="payment" className="mt-1" checked={checkout.paymentMethod === m.id} onChange={() => update("paymentMethod", m.id)} />
                  <span>
                    <span className="font-bold">{m.label}</span> {m.test && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-amber-900">test mode</span>}
                    <span className="block text-xs text-brand-muted">{m.description}</span>
                  </span>
                </label>
              ))
            )}
          </fieldset>
          {/* Honeypot: hidden from people, filled by bots. */}
          <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 opacity-0" value={checkout.website} onChange={(e) => update("website", e.target.value)} />
        </div>
        <dl className="mt-6 space-y-1 border-t border-brand-line pt-5 text-sm">
          <div className="flex justify-between"><dt className="text-brand-muted-strong">Subtotal</dt><dd className="mono">{money(subtotal)}</dd></div>
          {checkout.fulfillment === "delivery" && <div className="flex justify-between"><dt className="text-brand-muted-strong">Delivery</dt><dd className="mono" data-testid="text-delivery-fee">{checkout.deliveryZoneId ? (fee ? money(fee) : "Free") : "—"}</dd></div>}
          <div className="flex items-center justify-between pt-1"><dt className="font-bold">Total</dt><dd className="mono text-xl font-bold" data-testid="text-checkout-total">{money(total)}</dd></div>
        </dl>
        <p className="mt-1 text-[11px] text-brand-muted">The final amount is confirmed by our server.</p>
        {belowMin && <p className="mt-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">The minimum order is {money(settings.minOrder)}.</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800" data-testid="text-checkout-error">{error}</p>}
        <button disabled={pending || belowMin || !methods.length} className="focus-ring mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-primary py-4 text-sm font-bold text-brand-on-primary disabled:opacity-60" data-testid="button-place-order">
          {pending ? "Sending your order..." : online ? <><Lock size={15} /> Continue to secure payment</> : <>{copy.checkout.placeOrder} <ArrowRight size={16} /></>}
        </button>
      </form>
    </div>
  );
}
