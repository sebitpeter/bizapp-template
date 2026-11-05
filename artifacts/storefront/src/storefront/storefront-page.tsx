import { useMemo, useState, type FormEvent } from "react";
import { ArrowRight, Check, Clock3, Mail, MapPin, Menu, Phone, Search, ShoppingBag } from "lucide-react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useCreateOrder, useListContent, useListProducts, useListReviews, type Product } from "@workspace/api-client-react";
import { BrandLogo } from "@/components/brand-logo";
import { errorMessage } from "@/lib/api-error";
import { copy } from "@/lib/business";
import { useSettings } from "@/lib/theme";
import { api, saveOrderToken } from "@/lib/api";
import { CartDrawer, CheckoutDialog, EmptyState, ProductCard, ProductSkeleton, ReviewCard, maxQty, type CartLine, type CheckoutForm, type CheckoutMethod } from "./parts";
import { ReviewDialog } from "./review-dialog";

/** Splits "Made slow. Gone fast." into a plain first line + an emphasised second line. */
function splitTitle(title: string): [string, string] {
  const match = title.match(/^(.+?[.!?])\s+(.+)$/);
  return match ? [match[1], match[2]] : [title, ""];
}

export default function StorefrontPage() {
  const settings = useSettings();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [favorites, setFavorites] = useState<number[]>([]);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [newsletter, setNewsletter] = useState("");
  const [newsletterSent, setNewsletterSent] = useState(false);
  const [newsletterPending, setNewsletterPending] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [, navigate] = useLocation();
  const [checkout, setCheckout] = useState<CheckoutForm>(() => ({
    customerName: "", customerPhone: "", customerEmail: "", fulfillment: settings.checkout.delivery.enabled ? "delivery" : "pickup",
    deliveryZoneId: "", deliveryAddress: "", deliveryNote: "", paymentMethod: "", website: "",
  }));
  const methodsQuery = useQuery({
    queryKey: ["checkout-options"],
    queryFn: () => api<{ methods: CheckoutMethod[] }>("GET", "/checkout/options"),
    enabled: checkoutOpen,
    staleTime: 30_000,
  });
  const methods = methodsQuery.data?.methods ?? [];

  const productsQuery = useListProducts();
  const reviewsQuery = useListReviews();
  const contentQuery = useListContent();
  const createOrder = useCreateOrder();

  const products = productsQuery.data ?? [];
  const reviews = reviewsQuery.data ?? [];
  const content = Object.fromEntries((contentQuery.data ?? []).map((entry) => [entry.key, entry.value])) as Record<string, string | undefined>;
  const categories = ["All", ...settings.categories];
  const [titleA, titleB] = splitTitle(content.hero_title || settings.name);
  const heroImage = settings.heroImageUrl || "/hero.png";
  const avgRating = reviews.length ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length : 0;

  const visibleProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => (category === "All" || p.category === category) && `${p.name} ${p.description} ${p.tags.join(" ")}`.toLowerCase().includes(q));
  }, [products, category, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cart.reduce((sum, item) => sum + item.quantity * item.product.price, 0);
  const notify = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  };
  const addToCart = (product: Product) => {
    setCart((current) =>
      current.some((item) => item.product.id === product.id)
        ? current.map((item) => (item.product.id === product.id ? { ...item, quantity: Math.min(maxQty(product), item.quantity + 1) } : item))
        : [...current, { product, quantity: 1 }],
    );
    notify(`${product.name} ${copy.products.addedToCart}`);
  };
  const toggleFavorite = (id: number) => {
    const isFav = favorites.includes(id);
    setFavorites((current) => (isFav ? current.filter((f) => f !== id) : [...current, id]));
    notify(isFav ? "Removed from favorites" : "Saved for later");
  };
  const changeQuantity = (id: number, delta: number) =>
    setCart((current) => current.flatMap((item) => (item.product.id === id ? (item.quantity + delta > 0 ? [{ ...item, quantity: Math.min(maxQty(item.product), item.quantity + delta) }] : []) : [item])));

  const placeOrder = (event: FormEvent) => {
    event.preventDefault();
    if (!cart.length) return;
    const c = checkout;
    const method = c.paymentMethod || methods[0]?.id;
    if (!c.customerName.trim() || c.customerPhone.replace(/\D/g, "").length < 6) return setCheckoutError("Enter your name and a phone number we can reach you on.");
    if (c.fulfillment === "delivery" && (!c.deliveryZoneId || !c.deliveryAddress.trim())) return setCheckoutError("Choose your delivery area and enter an address.");
    if (!method) return setCheckoutError("Choose how you want to pay.");
    setCheckoutError("");
    // Only ids + quantities are sent. The server looks up real prices and fees.
    createOrder.mutate(
      {
        data: {
          customerName: c.customerName.trim(),
          customerPhone: c.customerPhone.trim(),
          customerEmail: c.customerEmail.trim() || undefined,
          fulfillment: c.fulfillment,
          deliveryZoneId: c.fulfillment === "delivery" ? c.deliveryZoneId : undefined,
          deliveryAddress: c.fulfillment === "delivery" ? c.deliveryAddress.trim() : undefined,
          deliveryNote: c.deliveryNote.trim() || undefined,
          paymentMethod: method as CheckoutMethod["id"],
          website: c.website || undefined,
          items: cart.map(({ product, quantity }) => ({ productId: product.id, quantity })),
        },
      },
      {
        onSuccess: (receipt) => {
          saveOrderToken(receipt.code, receipt.accessToken);
          setCart([]);
          if (receipt.checkoutUrl && /^https?:\/\//.test(receipt.checkoutUrl)) {
            window.location.assign(receipt.checkoutUrl);
            return;
          }
          setCheckoutOpen(false);
          setCartOpen(false);
          navigate(`/order/${encodeURIComponent(receipt.code)}`);
        },
        onError: (error) => {
          setCheckoutError(errorMessage(error, "We couldn't place that order. Please try again."));
          productsQuery.refetch(); // stock may have changed
        },
      },
    );
  };
  const submitNewsletter = async (event: FormEvent) => {
    event.preventDefault();
    if (!newsletter || newsletterPending) return;
    setNewsletterPending(true);
    try {
      await api("POST", "/newsletter", { email: newsletter.trim() });
      setNewsletterSent(true);
      notify(copy.newsletter.done);
    } catch (error) {
      notify(errorMessage(error, "Couldn't subscribe. Please try again."));
    } finally {
      setNewsletterPending(false);
    }
  };

  const navLinks = [
    { href: "#products", label: copy.nav.products },
    { href: "#story", label: copy.nav.story },
    { href: "#visit", label: copy.nav.visit },
  ];
  const socials = Object.entries(settings.socials).filter(([, url]) => url);
  const firstHours = settings.hours[0];

  return (
    <div className="min-h-[100dvh] bg-brand-bg text-brand-ink">
      <div className="bg-brand-ink px-4 py-2 text-center text-[11px] font-semibold tracking-[.08em] text-brand-on-ink" data-testid="banner-announcement">
        {content.announcement || copy.topBanner}
      </div>
      <header className="sticky top-0 z-30 border-b border-brand-line/80 bg-brand-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-4 lg:px-8">
          <BrandLogo />
          <nav className="hidden items-center gap-8 text-sm font-semibold md:flex" aria-label="Main navigation">
            {navLinks.map((l) => (
              <a key={l.href} href={l.href} className="transition hover:text-brand-accent-strong">{l.label}</a>
            ))}
            <Link href="/track" className="transition hover:text-brand-accent-strong" data-testid="link-track">Track order</Link>
            <Link href="/admin" className="text-brand-muted transition hover:text-brand-primary" data-testid="link-admin">{copy.nav.staff}</Link>
          </nav>
          <div className="flex items-center gap-2">
            <button className="focus-ring rounded-full p-2.5 transition hover:bg-brand-line" onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })} aria-label="Search products" data-testid="button-search"><Search size={19} /></button>
            <button className="focus-ring relative rounded-full bg-brand-primary p-2.5 text-brand-on-primary transition hover:bg-brand-primary-hover" onClick={() => setCartOpen(true)} aria-label={`Open cart, ${cartCount} items`} data-testid="button-open-cart">
              <ShoppingBag size={19} />
              <span className="absolute -right-1 -top-1 grid min-h-4 min-w-4 place-items-center rounded-full bg-brand-accent px-1 text-[9px] font-bold text-brand-ink" data-testid="text-cart-count">{cartCount}</span>
            </button>
            <button className="focus-ring rounded-full p-2.5 md:hidden" onClick={() => setMobileMenu((open) => !open)} aria-label="Open menu" aria-expanded={mobileMenu} data-testid="button-mobile-menu"><Menu size={20} /></button>
          </div>
        </div>
        {mobileMenu && (
          <div className="border-t border-brand-line px-5 py-4 md:hidden">
            <div className="flex flex-col gap-4 text-sm font-semibold">
              {navLinks.map((l) => <a key={l.href} href={l.href} onClick={() => setMobileMenu(false)}>{l.label}</a>)}
              <Link href="/track">Track order</Link>
              <Link href="/admin">{copy.nav.staff}</Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="relative mx-auto grid max-w-[1240px] items-center gap-10 px-5 pb-16 pt-10 md:grid-cols-[.92fr_1.08fr] md:pb-24 md:pt-20 lg:px-8">
          <div className="relative z-10 animate-rise-in">
            <p className="mono mb-5 text-[10px] font-bold uppercase tracking-[.24em] text-brand-accent-strong">{copy.hero.eyebrow}</p>
            <h1 className="serif max-w-[560px] text-[clamp(3.2rem,8vw,7.4rem)] font-semibold leading-[.88] tracking-[-.065em] text-brand-ink" data-testid="heading-hero">
              {titleA}
              {titleB && <><br /><em className="font-medium text-brand-primary">{titleB}</em></>}
            </h1>
            {content.hero_subtitle && <p className="mt-7 max-w-[410px] text-[16px] leading-7 text-brand-muted-strong">{content.hero_subtitle}</p>}
            <div className="mt-9 flex flex-wrap items-center gap-4">
              <a href="#products" className="focus-ring group inline-flex items-center gap-3 rounded-full bg-brand-primary px-6 py-3.5 text-sm font-bold text-brand-on-primary shadow-brand transition hover:-translate-y-0.5 hover:bg-brand-primary-hover" data-testid="link-shop">{copy.hero.cta} <ArrowRight size={17} className="transition group-hover:translate-x-1" /></a>
              <span className="flex items-center gap-2 text-xs font-semibold text-brand-muted"><Clock3 size={15} /> {copy.hero.nextUp}</span>
            </div>
          </div>
          <div className="relative animate-rise-in delay-2">
            <div className="absolute -left-7 top-8 z-10 hidden -rotate-6 rounded-2xl bg-brand-accent px-4 py-3 text-center shadow-brand md:block">
              <span className="mono block text-[9px] uppercase tracking-[.16em] text-brand-ink/80">{copy.hero.noteLabel}</span>
              <strong className="serif text-xl text-brand-ink">{copy.hero.note}</strong>
            </div>
            <div className="relative aspect-[1.08/1] overflow-hidden rounded-[34px] bg-brand-accent shadow-brand-lg">
              <img src={heroImage} alt={copy.hero.imageAlt} className="h-full w-full object-cover" data-testid="img-hero" />
              <div className="absolute inset-0 bg-gradient-to-br from-brand-ink/10 via-transparent to-brand-ink/35" />
            </div>
            <div className="absolute -bottom-5 -right-2 flex items-center gap-2 rounded-full border border-brand-bg bg-brand-surface px-4 py-2.5 text-xs font-bold shadow-brand md:right-6">
              <span className="h-2 w-2 rounded-full bg-[#79904e]" /> {copy.hero.badge}{settings.contact.city ? ` in ${settings.contact.city}` : ""}
            </div>
          </div>
        </section>

        <section id="products" className="mx-auto max-w-[1240px] scroll-mt-24 px-5 py-16 lg:px-8">
          <div className="mb-8 flex flex-col justify-between gap-5 md:flex-row md:items-end">
            <div>
              <p className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">{copy.products.eyebrow}</p>
              <h2 className="serif text-4xl font-semibold tracking-[-.04em] md:text-5xl" data-testid="heading-products">{copy.products.title}</h2>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filter by category">
              {categories.map((item) => (
                <button key={item} onClick={() => setCategory(item)} aria-pressed={category === item} className={`focus-ring rounded-full border px-4 py-2 text-xs font-bold transition ${category === item ? "border-brand-primary bg-brand-primary text-brand-on-primary" : "border-brand-line-strong bg-transparent text-brand-primary hover:border-brand-primary"}`} data-testid={`button-category-${item.toLowerCase()}`}>{item}</button>
              ))}
            </div>
          </div>
          <div className="mb-7 flex items-center justify-between gap-4">
            <div className="relative max-w-[360px] flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-muted" size={17} />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={100} placeholder={copy.products.searchPlaceholder} aria-label="Search products" className="focus-ring w-full rounded-full border border-brand-line-strong bg-brand-surface py-3 pl-10 pr-4 text-sm outline-none placeholder:text-brand-muted" data-testid="input-search-products" />
            </div>
            <span className="hidden text-xs font-semibold text-brand-muted sm:block" data-testid="text-product-count">{visibleProducts.length} {copy.products.countSuffix}</span>
          </div>
          {productsQuery.isLoading ? (
            <ProductSkeleton />
          ) : productsQuery.isError ? (
            <EmptyState title="We couldn't load the menu" body="Please check your connection and try again." action="Try again" onAction={() => productsQuery.refetch()} />
          ) : visibleProducts.length === 0 ? (
            <EmptyState title={copy.products.empty} body="Try a different search or category." action="Show everything" onAction={() => { setSearch(""); setCategory("All"); }} />
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((product, index) => (
                <ProductCard key={product.id} product={product} favorite={favorites.includes(product.id)} onFavorite={() => toggleFavorite(product.id)} onAdd={() => addToCart(product)} index={index} />
              ))}
            </div>
          )}
        </section>

        <section id="story" className="scroll-mt-24 bg-brand-ink px-5 py-20 text-brand-surface lg:px-8">
          <div className="mx-auto grid max-w-[1240px] gap-12 md:grid-cols-[.85fr_1.15fr] md:items-center">
            <div className="animate-rise-in">
              <p className="mono mb-4 text-[10px] uppercase tracking-[.22em] text-brand-accent">{copy.story.eyebrow}</p>
              <h2 className="serif max-w-[520px] text-5xl font-medium leading-[.96] tracking-[-.05em] md:text-6xl">{copy.story.title} <em className="text-brand-accent">{copy.story.highlight}</em></h2>
            </div>
            <div className="grid gap-6 md:grid-cols-2">
              {content.story && <p className="border-l border-brand-muted pl-5 text-[15px] leading-7 text-brand-on-ink">{content.story}</p>}
              <div className="space-y-5">
                {copy.story.points.map((point, i) => (
                  <div key={point.title} className="flex items-start gap-4">
                    <span className="serif text-3xl text-brand-accent">{String(i + 1).padStart(2, "0")}</span>
                    <p className="text-sm leading-6 text-brand-on-ink"><strong className="block text-brand-surface">{point.title}</strong> {point.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {(
          <section className="mx-auto max-w-[1240px] px-5 py-20 lg:px-8" data-testid="section-reviews">
            <div className="mb-10 flex items-end justify-between">
              <div>
                <p className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">{copy.reviews.eyebrow}</p>
                <h2 className="serif text-4xl font-semibold tracking-[-.04em]">{copy.reviews.title}</h2>
              </div>
              <div className="flex flex-col items-end gap-2">
                {reviews.length > 0 && <span className="hidden text-xs font-semibold text-brand-muted sm:block">{avgRating.toFixed(1)} average from {reviews.length} reviews</span>}
                <button onClick={() => setReviewOpen(true)} className="focus-ring rounded-full border border-brand-line-strong px-4 py-2 text-xs font-bold text-brand-primary transition hover:bg-brand-surface" data-testid="button-write-review">Write a review</button>
              </div>
            </div>
            {reviews.length === 0 && <p className="text-sm text-brand-muted-strong">No reviews yet — be the first.</p>}
            <div className="grid gap-5 md:grid-cols-3">
              {reviews.slice(0, 3).map((review, index) => <ReviewCard key={review.id} review={review} index={index} />)}
            </div>
          </section>
        )}

        <section id="visit" className="scroll-mt-24 border-y border-brand-line bg-brand-bg-alt px-5 py-16 lg:px-8">
          <div className="mx-auto grid max-w-[1240px] gap-10 md:grid-cols-[1fr_.8fr] md:items-center">
            <div>
              <p className="mono mb-3 text-[10px] uppercase tracking-[.2em] text-brand-accent-strong">{copy.visit.eyebrow}</p>
              <h2 className="serif text-4xl font-semibold tracking-[-.04em] md:text-5xl">{copy.visit.title}</h2>
              <p className="mt-4 max-w-md text-sm leading-6 text-brand-muted-strong">{copy.visit.body}</p>
              <div className="mt-7 flex flex-wrap gap-3 text-xs font-bold text-brand-primary">
                {settings.contact.address && (
                  settings.contact.mapUrl
                    ? <a href={settings.contact.mapUrl} target="_blank" rel="noopener noreferrer" className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand-surface px-4 py-2.5"><MapPin size={15} /> {settings.contact.address}</a>
                    : <span className="inline-flex items-center gap-2 rounded-full bg-brand-surface px-4 py-2.5"><MapPin size={15} /> {settings.contact.address}</span>
                )}
                {settings.contact.phone && <a href={`tel:${settings.contact.phone.replace(/[^+\d]/g, "")}`} className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand-surface px-4 py-2.5"><Phone size={15} /> {settings.contact.phone}</a>}
                {settings.contact.email && <a href={`mailto:${settings.contact.email}`} className="focus-ring inline-flex items-center gap-2 rounded-full bg-brand-surface px-4 py-2.5"><Mail size={15} /> {settings.contact.email}</a>}
              </div>
              {socials.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-4 text-xs font-semibold text-brand-muted-strong">
                  {socials.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="capitalize underline-offset-4 hover:text-brand-primary hover:underline">{name === "x" ? "X" : name}</a>)}
                </div>
              )}
            </div>
            <div className="relative min-h-[210px] overflow-hidden rounded-[28px] bg-brand-primary p-7 text-brand-on-primary shadow-brand">
              <div className="absolute -right-10 -top-14 h-48 w-48 rounded-full border-[18px] border-white/15" />
              <div className="absolute -bottom-16 left-12 h-48 w-48 rounded-full border-[26px] border-white/10" />
              <div className="relative">
                <span className="mono text-[10px] uppercase tracking-[.2em] opacity-80">{copy.visit.cardLabel}</span>
                <p className="serif mt-4 max-w-xs text-3xl leading-tight">{copy.visit.cardText}</p>
                {settings.hours.length > 0 && (
                  <dl className="mt-5 space-y-1 text-sm" data-testid="list-hours">
                    {settings.hours.map((h) => (
                      <div key={h.label} className="flex gap-3"><dt className="min-w-20 font-bold">{h.label}</dt><dd className="opacity-90">{h.value}</dd></div>
                    ))}
                  </dl>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className="bg-brand-accent px-5 py-14 text-brand-ink lg:px-8">
          <div className="mx-auto flex max-w-[1240px] flex-col items-start justify-between gap-7 md:flex-row md:items-center">
            <div>
              <p className="mono mb-2 text-[10px] uppercase tracking-[.2em] text-brand-ink/75">{copy.newsletter.eyebrow}</p>
              <h2 className="serif text-4xl font-semibold tracking-[-.04em]">{copy.newsletter.title}</h2>
              <p className="mt-2 text-sm text-brand-ink/80">{copy.newsletter.body}</p>
            </div>
            <form onSubmit={submitNewsletter} className="flex w-full max-w-[440px] gap-2">
              {newsletterSent ? (
                <div className="flex items-center gap-2 rounded-full bg-brand-surface px-5 py-3.5 text-sm font-bold"><Check size={17} /> {copy.newsletter.done}</div>
              ) : (
                <>
                  <input type="email" value={newsletter} onChange={(e) => setNewsletter(e.target.value)} placeholder="you@example.com" aria-label="Email address" maxLength={254} className="focus-ring min-w-0 flex-1 rounded-full border-0 bg-brand-surface px-5 py-3.5 text-sm outline-none" required data-testid="input-newsletter" />
                  <button disabled={newsletterPending} className="focus-ring rounded-full bg-brand-ink px-5 py-3.5 text-sm font-bold text-brand-surface transition hover:bg-brand-primary-hover disabled:opacity-60" data-testid="button-newsletter">{copy.newsletter.button}</button>
                </>
              )}
            </form>
          </div>
        </section>
      </main>

      <footer className="bg-brand-ink px-5 py-10 text-brand-on-ink lg:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <BrandLogo dark />
          <div className="text-left text-xs leading-6 sm:text-right">
            <p>{copy.footer.line}</p>
            {firstHours && <p>{firstHours.label} · {firstHours.value}</p>}
            <p className="text-brand-muted">© {new Date().getFullYear()} {settings.name} · {copy.footer.signoff}</p>
          </div>
        </div>
      </footer>

      {toast && (
        <div role="status" className="animate-toast-pop fixed bottom-5 left-1/2 z-[80] flex max-w-[92vw] -translate-x-1/2 items-center gap-2 rounded-full bg-brand-ink px-5 py-3 text-sm font-bold text-brand-surface shadow-brand-lg" data-testid="status-toast">
          <Check size={16} className="shrink-0 text-brand-accent" /> {toast}
        </div>
      )}
      {reviewOpen && <ReviewDialog products={products} onClose={() => setReviewOpen(false)} onDone={() => notify("Thanks! Your review will appear once it's approved.")} />}
      {cartOpen && <CartDrawer cart={cart} total={cartTotal} onClose={() => setCartOpen(false)} onChange={changeQuantity} onCheckout={() => { if (cart.length) { setCheckoutError(""); setCheckoutOpen(true); } }} />}
      {checkoutOpen && (
        <CheckoutDialog
          checkout={{ ...checkout, paymentMethod: checkout.paymentMethod || methods[0]?.id || "" }}
          setCheckout={setCheckout}
          settings={settings.checkout}
          methods={methods}
          methodsLoading={methodsQuery.isLoading}
          pending={createOrder.isPending}
          error={checkoutError || (methodsQuery.isError ? "Couldn't load payment options. Close and try again." : "")}
          onClose={() => setCheckoutOpen(false)}
          onSubmit={placeOrder}
          subtotal={cartTotal}
        />
      )}
    </div>
  );
}
