import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Plus, RotateCcw, Save, ShoppingBag, Star, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { getGetSiteSettingsQueryKey, useGetSiteSettings, useResetSiteSettings, useUpdateSiteSettings, type SiteSettings } from "@workspace/api-client-react";
import { siteSettingsSchema } from "@workspace/business";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage } from "@/lib/api-error";
import { brandVars, contrastRatio, formatMoney } from "@/lib/theme";
import { ErrorBlock } from "./common";
import { ImageField } from "./image-field";

type Errors = Record<string, string>;

const COLOR_FIELDS: { key: keyof SiteSettings["colors"]; label: string; hint: string }[] = [
  { key: "primary", label: "Primary", hint: "Buttons, links, prices" },
  { key: "accent", label: "Accent", hint: "Badges, highlights, newsletter" },
  { key: "ink", label: "Ink", hint: "Text, footer, dark sections" },
  { key: "background", label: "Background", hint: "Page background" },
  { key: "surface", label: "Surface", hint: "Cards, drawers, light text" },
];

const PRESETS: { name: string; colors: SiteSettings["colors"] }[] = [
  { name: "Bakery", colors: { primary: "#8d304d", accent: "#f2a263", ink: "#4c202f", background: "#f7f0e4", surface: "#fff7e8" } },
  { name: "Coffee", colors: { primary: "#6b4226", accent: "#d4a373", ink: "#2b1d14", background: "#f5efe6", surface: "#fffaf3" } },
  { name: "Fresh", colors: { primary: "#2f6f4f", accent: "#f2c14e", ink: "#1d3329", background: "#f1f5ef", surface: "#ffffff" } },
  { name: "Ocean", colors: { primary: "#1f5f8b", accent: "#ff9f68", ink: "#14283a", background: "#eef4f8", surface: "#ffffff" } },
  { name: "Mono", colors: { primary: "#111111", accent: "#e5e5e5", ink: "#111111", background: "#fafafa", surface: "#ffffff" } },
];

const HEX = /^#[0-9a-f]{6}$/i;

function issuesToErrors(draft: SiteSettings): Errors {
  const result = siteSettingsSchema.safeParse(draft);
  if (result.success) return {};
  const out: Errors = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export default function BrandingPage() {
  const settings = useGetSiteSettings();
  if (settings.isError) return <ErrorBlock onRetry={() => settings.refetch()} />;
  if (!settings.data) {
    return (
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-56 w-full rounded-xl" />)}</div>
        <Skeleton className="h-96 w-full rounded-xl" />
      </div>
    );
  }
  return <BrandingEditor saved={settings.data} />;
}

function BrandingEditor({ saved }: { saved: SiteSettings }) {
  const queryClient = useQueryClient();
  const update = useUpdateSiteSettings();
  const reset = useResetSiteSettings();
  const [draft, setDraft] = useState<SiteSettings>(saved);
  const [showErrors, setShowErrors] = useState(false);
  const [newCategory, setNewCategory] = useState("");

  useEffect(() => setDraft(saved), [saved]);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(saved), [draft, saved]);
  const errors = useMemo(() => issuesToErrors(draft), [draft]);
  const errorCount = Object.keys(errors).length;
  const err = (path: string) => (showErrors || draft !== saved) && errors[path] ? <p className="text-xs text-destructive" data-testid={`error-${path}`}>{errors[path]}</p> : null;

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);

  const patch = <K extends keyof SiteSettings>(key: K, value: SiteSettings[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const patchIn = <K extends "colors" | "contact" | "socials" | "currency" | "seo">(key: K, field: keyof SiteSettings[K], value: string) =>
    setDraft((d) => ({ ...d, [key]: { ...d[key], [field]: value } }));

  const onSaved = (data: SiteSettings, message: string) => {
    queryClient.setQueryData(getGetSiteSettingsQueryKey(), data);
    toast.success(message, { description: "Your storefront is already showing the new look." });
  };

  const save = () => {
    setShowErrors(true);
    if (errorCount) {
      toast.error("Please fix the highlighted fields", { description: `${errorCount} field${errorCount > 1 ? "s need" : " needs"} attention.` });
      return;
    }
    update.mutate({ data: draft }, { onSuccess: (data) => onSaved(data, "Branding saved"), onError: (e) => toast.error("Couldn't save", { description: errorMessage(e) }) });
  };

  const doReset = () =>
    reset.mutate(undefined, { onSuccess: (data) => onSaved(data, "Reset to the defaults from business.config.ts"), onError: (e) => toast.error("Couldn't reset", { description: errorMessage(e) }) });

  const contrastWarnings = [
    { a: draft.colors.ink, b: draft.colors.background, label: "Ink text on background" },
    { a: draft.colors.surface, b: draft.colors.primary, label: "Button text on primary" },
    { a: draft.colors.ink, b: draft.colors.accent, label: "Ink text on accent" },
  ].filter(({ a, b }) => HEX.test(a) && HEX.test(b) && contrastRatio(a, b) < 4.5);

  return (
    <div className="pb-24">
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0 space-y-6">
          <Section title="Identity" description="Your name, logo and the big photo at the top of the shop.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="s-name" label="Business name" error={err("name")}>
                <Input id="s-name" value={draft.name} maxLength={60} onChange={(e) => patch("name", e.target.value)} data-testid="input-settings-name" />
              </Field>
              <Field id="s-tagline" label="Tagline" error={err("tagline")} hint="Small text under the name.">
                <Input id="s-tagline" value={draft.tagline} maxLength={80} onChange={(e) => patch("tagline", e.target.value)} data-testid="input-settings-tagline" />
              </Field>
            </div>
            <ImageField id="logo" label="Logo" hint="Square PNG/WebP with a transparent background works best. Leave empty for a letter monogram." value={draft.logoUrl} onChange={(v) => patch("logoUrl", v)} />
            {err("logoUrl")}
            <ImageField id="favicon" label="Favicon (browser tab icon)" hint="Square, at least 64×64. Leave empty to auto-generate from your name and primary colour." value={draft.faviconUrl} onChange={(v) => patch("faviconUrl", v)} previewClassName="h-16 w-16" />
            {err("faviconUrl")}
            <ImageField id="hero" label="Hero image" hint="Wide photo, roughly 1600×1400. Also used when a product has no photo." value={draft.heroImageUrl} onChange={(v) => patch("heroImageUrl", v)} previewClassName="h-24 w-36" fit="cover" />
            {err("heroImageUrl")}
          </Section>

          <Section title="Colours" description="Five colours drive the whole design. Everything else is mixed from these.">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((p) => (
                <button key={p.name} type="button" onClick={() => patch("colors", p.colors)} className="focus-ring flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-xs font-medium hover:bg-muted" data-testid={`preset-${p.name.toLowerCase()}`}>
                  <span className="flex -space-x-1">{[p.colors.primary, p.colors.accent, p.colors.ink].map((c) => <span key={c} className="h-3.5 w-3.5 rounded-full border border-white" style={{ background: c }} />)}</span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {COLOR_FIELDS.map(({ key, label, hint }) => (
                <div key={key} className="flex items-center gap-3 rounded-lg border bg-background p-2.5">
                  <label className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-md border shadow-sm" style={{ background: HEX.test(draft.colors[key]) ? draft.colors[key] : "transparent" }}>
                    <span className="sr-only">Pick {label} colour</span>
                    <input type="color" value={HEX.test(draft.colors[key]) ? draft.colors[key] : "#000000"} onChange={(e) => patchIn("colors", key, e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" data-testid={`color-${key}`} />
                  </label>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`hex-${key}`} className="text-sm">{label}</Label>
                      <Input id={`hex-${key}`} value={draft.colors[key]} maxLength={7} onChange={(e) => patchIn("colors", key, e.target.value.trim())} className="h-7 w-24 font-mono text-xs uppercase" aria-invalid={!!errors[`colors.${key}`]} />
                    </div>
                    <p className="truncate text-xs text-muted-foreground">{hint}</p>
                    {err(`colors.${key}`)}
                  </div>
                </div>
              ))}
            </div>
            {contrastWarnings.length > 0 && (
              <div className="flex gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900" role="status" data-testid="contrast-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-medium">Some text may be hard to read</p>
                  <ul className="mt-1 list-disc pl-4 text-xs">
                    {contrastWarnings.map((w) => <li key={w.label}>{w.label}: contrast {contrastRatio(w.a, w.b).toFixed(1)}:1 (aim for 4.5:1 or more)</li>)}
                  </ul>
                </div>
              </div>
            )}
          </Section>

          <Section title="Contact & location" description="Shown in the “Find us” section and footer.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="c-email" label="Email" error={err("contact.email")}><Input id="c-email" type="email" value={draft.contact.email} onChange={(e) => patchIn("contact", "email", e.target.value)} /></Field>
              <Field id="c-phone" label="Phone" error={err("contact.phone")}><Input id="c-phone" type="tel" value={draft.contact.phone} onChange={(e) => patchIn("contact", "phone", e.target.value)} /></Field>
              <Field id="c-whatsapp" label="WhatsApp" error={err("contact.whatsapp")} hint="Optional."><Input id="c-whatsapp" value={draft.contact.whatsapp} onChange={(e) => patchIn("contact", "whatsapp", e.target.value)} /></Field>
              <Field id="c-city" label="City" error={err("contact.city")} hint="Used in “Made today in …”."><Input id="c-city" value={draft.contact.city} onChange={(e) => patchIn("contact", "city", e.target.value)} /></Field>
              <Field id="c-address" label="Address" error={err("contact.address")} className="sm:col-span-2"><Input id="c-address" value={draft.contact.address} onChange={(e) => patchIn("contact", "address", e.target.value)} /></Field>
              <Field id="c-map" label="Map link" error={err("contact.mapUrl")} hint="Optional https:// link, e.g. Google Maps." className="sm:col-span-2"><Input id="c-map" value={draft.contact.mapUrl} placeholder="https://maps.google.com/…" onChange={(e) => patchIn("contact", "mapUrl", e.target.value)} /></Field>
            </div>
          </Section>

          <Section title="Social links" description="Full https:// links. Leave empty to hide.">
            <div className="grid gap-4 sm:grid-cols-2">
              {(Object.keys(draft.socials) as (keyof SiteSettings["socials"])[]).map((key) => (
                <Field key={key} id={`so-${key}`} label={key === "x" ? "X (Twitter)" : key[0].toUpperCase() + key.slice(1)} error={err(`socials.${key}`)}>
                  <Input id={`so-${key}`} value={draft.socials[key]} placeholder="https://" onChange={(e) => patchIn("socials", key, e.target.value.trim())} />
                </Field>
              ))}
            </div>
          </Section>

          <Section title="Opening hours" description="Up to 10 rows, e.g. “Mon–Fri” / “8:00 – 18:00”.">
            <div className="space-y-2">
              {draft.hours.map((h, i) => (
                <div key={i} className="flex gap-2">
                  <Input value={h.label} placeholder="Days" maxLength={40} aria-label={`Days, row ${i + 1}`} onChange={(e) => patch("hours", draft.hours.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="w-36" />
                  <Input value={h.value} placeholder="Hours" maxLength={60} aria-label={`Hours, row ${i + 1}`} onChange={(e) => patch("hours", draft.hours.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove row ${i + 1}`} onClick={() => patch("hours", draft.hours.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              {Object.keys(errors).some((k) => k.startsWith("hours")) && (showErrors || dirty) && <p className="text-xs text-destructive">Every row needs both days and hours.</p>}
              <Button type="button" variant="outline" size="sm" disabled={draft.hours.length >= 10} onClick={() => patch("hours", [...draft.hours, { label: "", value: "" }])}><Plus className="mr-1.5 h-4 w-4" /> Add row</Button>
            </div>
          </Section>

          <Section title="Shop settings" description="Currency and the product categories customers can filter by.">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="cur-code" label="Currency code" error={err("currency.code")} hint="3 letters: USD, KES, UGX, SSP, EUR…">
                <Input id="cur-code" value={draft.currency.code} maxLength={3} onChange={(e) => patchIn("currency", "code", e.target.value.toUpperCase())} className="font-mono uppercase" />
              </Field>
              <Field id="cur-locale" label="Number format (locale)" error={err("currency.locale")} hint={`Preview: ${errors["currency.code"] || errors["currency.locale"] ? "—" : formatMoney(1234.5, draft.currency)}`}>
                <Input id="cur-locale" value={draft.currency.locale} maxLength={20} onChange={(e) => patchIn("currency", "locale", e.target.value.trim())} className="font-mono" />
              </Field>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-category">Categories</Label>
              <div className="flex flex-wrap gap-2">
                {draft.categories.map((c) => (
                  <Badge key={c} variant="secondary" className="gap-1 py-1 pl-2.5 pr-1 text-sm font-normal">
                    {c}
                    <button type="button" className="rounded-full p-0.5 hover:bg-black/10" aria-label={`Remove ${c}`} onClick={() => patch("categories", draft.categories.filter((x) => x !== c))}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); const v = newCategory.trim(); if (v && !draft.categories.includes(v) && draft.categories.length < 20) { patch("categories", [...draft.categories, v]); setNewCategory(""); } }}>
                <Input id="new-category" value={newCategory} maxLength={40} placeholder="New category" onChange={(e) => setNewCategory(e.target.value)} className="max-w-xs" />
                <Button type="submit" variant="outline" disabled={!newCategory.trim() || draft.categories.length >= 20}><Plus className="mr-1.5 h-4 w-4" /> Add</Button>
              </form>
              {err("categories")}
              <p className="text-xs text-muted-foreground">Removing a category doesn't delete products — edit them to move them.</p>
            </div>
          </Section>

          <Section title="Search engines (SEO)" description="What Google and link previews show.">
            <Field id="seo-title" label={`Page title (${draft.seo.title.length}/70)`} error={err("seo.title")}>
              <Input id="seo-title" value={draft.seo.title} maxLength={70} onChange={(e) => patchIn("seo", "title", e.target.value)} data-testid="input-seo-title" />
            </Field>
            <Field id="seo-desc" label={`Description (${draft.seo.description.length}/160)`} error={err("seo.description")}>
              <Textarea id="seo-desc" value={draft.seo.description} maxLength={160} rows={3} onChange={(e) => patchIn("seo", "description", e.target.value)} />
            </Field>
            <div className="rounded-lg border bg-background p-4">
              <p className="text-xs text-muted-foreground">Google preview</p>
              <p className="mt-1 truncate text-lg text-[#1a0dab]">{draft.seo.title || draft.name}</p>
              <p className="line-clamp-2 text-sm text-[#4d5156]">{draft.seo.description || "Add a description so people know what you sell."}</p>
            </div>
          </Section>
        </div>

        <aside className="lg:sticky lg:top-20 lg:h-fit">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Live preview</CardTitle>
              <CardDescription>Updates as you type. Nothing is public until you save.</CardDescription>
            </CardHeader>
            <CardContent>
              <BrandPreview draft={draft} />
            </CardContent>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur md:left-[var(--sidebar-width)] md:peer-data-[state=collapsed]:left-[var(--sidebar-width-icon)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="sm" disabled={reset.isPending} data-testid="button-reset-branding"><RotateCcw className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Reset to defaults</span></Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset branding?</AlertDialogTitle>
                <AlertDialogDescription>All settings on this page go back to the defaults in business.config.ts. Uploaded images stay on the server but won't be used.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={doReset}>Reset</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <div className="flex items-center gap-2 sm:gap-3">
            <span className="hidden text-sm text-muted-foreground sm:inline" data-testid="text-dirty-state">{dirty ? (errorCount ? `${errorCount} field${errorCount > 1 ? "s" : ""} to fix` : "Unsaved changes") : "All changes saved"}</span>
            <Button variant="outline" size="sm" disabled={!dirty || update.isPending} onClick={() => { setDraft(saved); setShowErrors(false); }}>Discard</Button>
            <Button size="sm" disabled={!dirty || update.isPending} onClick={save} data-testid="button-save-branding">
              {update.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />} Save<span className="hidden sm:inline">&nbsp;changes</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function Field({ id, label, hint, error, className = "", children }: { id: string; label: string; hint?: string; error?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error || (hint && <p className="text-xs text-muted-foreground">{hint}</p>)}
    </div>
  );
}

/** A mini storefront rendered with the draft colours (scoped, so the admin itself doesn't change). */
function BrandPreview({ draft }: { draft: SiteSettings }) {
  const safe = Object.fromEntries(Object.entries(draft.colors).map(([k, v]) => [k, HEX.test(v) ? v : "#cccccc"])) as SiteSettings["colors"];
  const price = errorsFree(draft) ? formatMoney(7.5, draft.currency) : "7.50";
  const initial = (draft.name.trim()[0] ?? "?").toUpperCase();
  return (
    <div className="brand-scope overflow-hidden rounded-xl border bg-brand-bg text-brand-ink" style={{ ...brandVars(safe), fontFamily: "var(--app-font-sans)" }} data-testid="branding-preview">
      <div className="bg-brand-ink px-3 py-1 text-center text-[9px] font-semibold text-brand-on-ink">Announcement bar</div>
      <div className="flex items-center justify-between border-b border-brand-line px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          {draft.logoUrl ? <img src={draft.logoUrl} alt="" className="h-7 w-7 rounded-md object-contain" /> : <span className="serif grid h-7 w-7 place-items-center rounded-md bg-brand-primary text-sm font-bold text-brand-on-primary">{initial}</span>}
          <div className="min-w-0 leading-none">
            <p className="serif truncate text-sm font-semibold">{draft.name || "Your business"}</p>
            <p className="mono truncate text-[7px] uppercase tracking-[.2em] text-brand-muted">{draft.tagline}</p>
          </div>
        </div>
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-primary text-brand-on-primary"><ShoppingBag className="h-3.5 w-3.5" /></span>
      </div>
      <div className="grid grid-cols-[1fr_.9fr] items-center gap-3 p-3">
        <div>
          <p className="mono text-[7px] font-bold uppercase tracking-[.2em] text-brand-accent-strong">Welcome</p>
          <p className="serif mt-1 text-lg font-semibold leading-none tracking-tight">Fresh today. <em className="text-brand-primary">Gone soon.</em></p>
          <span className="mt-3 inline-block rounded-full bg-brand-primary px-3 py-1.5 text-[10px] font-bold text-brand-on-primary">Shop now</span>
        </div>
        <div className="aspect-square overflow-hidden rounded-xl bg-brand-accent">
          {draft.heroImageUrl && <img src={draft.heroImageUrl} alt="" className="h-full w-full object-cover" />}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-3 pb-3">
        {["Product one", "Product two"].map((n) => (
          <div key={n} className="rounded-lg border border-brand-line bg-brand-surface p-1.5">
            <div className="aspect-[4/3] rounded-md bg-brand-line" />
            <div className="mt-1.5 flex items-center justify-between gap-1 px-0.5">
              <span className="serif truncate text-[11px] font-semibold">{n}</span>
              <span className="mono text-[9px] font-bold text-brand-primary">{price}</span>
            </div>
            <div className="mt-1 flex items-center justify-between px-0.5">
              <span className="flex items-center gap-0.5 text-[9px] text-brand-primary"><Star className="h-2.5 w-2.5" fill="currentColor" /> 4.9</span>
              <span className="rounded-full bg-brand-primary px-2 py-0.5 text-[8px] font-bold text-brand-on-primary">Add</span>
            </div>
          </div>
        ))}
      </div>
      <div className="bg-brand-accent px-3 py-2 text-[10px] font-semibold">Newsletter strip</div>
      <div className="bg-brand-ink px-3 py-2.5 text-[9px] text-brand-on-ink">© {new Date().getFullYear()} {draft.name}</div>
    </div>
  );
}

function errorsFree(d: SiteSettings) {
  return /^[A-Z]{3}$/.test(d.currency.code) && /^[a-zA-Z]{2,3}(-[A-Za-z0-9]{2,8}){0,2}$/.test(d.currency.locale);
}
