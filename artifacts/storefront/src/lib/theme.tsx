import { createContext, useContext, useEffect, useMemo, type CSSProperties, type ReactNode } from "react";
import { useGetSiteSettings, type SiteSettings } from "@workspace/api-client-react";
import { business } from "./business";

/**
 * Runtime branding. Settings come from GET /api/settings (saved in Admin →
 * Branding) and fall back to business.config.ts while loading.
 */
type SettingsState = { settings: SiteSettings; loading: boolean };

const defaults = business.settings as SiteSettings;
const SettingsContext = createContext<SettingsState>({ settings: defaults, loading: true });

export function brandVars(colors: SiteSettings["colors"]): CSSProperties {
  return {
    "--brand-primary": colors.primary,
    "--brand-accent": colors.accent,
    "--brand-ink": colors.ink,
    "--brand-bg": colors.background,
    "--brand-surface": colors.surface,
  } as CSSProperties;
}

/** A tiny SVG favicon: first letter of the name on the primary colour. */
export function monogramFavicon(name: string, primary: string, surface: string): string {
  const letter = (name.trim()[0] ?? "?").toUpperCase().replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${primary}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="700" fill="${surface}">${letter}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

function setMeta(selector: string, attr: string, value: string) {
  const el = document.head.querySelector<HTMLMetaElement>(selector);
  if (el) el.setAttribute(attr, value);
}

function applyDocumentBranding(s: SiteSettings) {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(brandVars(s.colors))) root.style.setProperty(key, String(value));
  const title = s.seo.title || s.name;
  document.title = title;
  setMeta('meta[name="description"]', "content", s.seo.description);
  setMeta('meta[property="og:title"]', "content", title);
  setMeta('meta[property="og:description"]', "content", s.seo.description);
  setMeta('meta[name="theme-color"]', "content", s.colors.primary);
  let icon = document.head.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon) {
    icon = document.createElement("link");
    icon.rel = "icon";
    document.head.appendChild(icon);
  }
  const href = s.faviconUrl || monogramFavicon(s.name, s.colors.primary, s.colors.surface);
  icon.type = href.startsWith("data:image/svg") ? "image/svg+xml" : "";
  icon.href = href;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const query = useGetSiteSettings({ query: { staleTime: 60_000, retry: 1 } as never });
  const settings = query.data ?? defaults;
  useEffect(() => {
    if (query.data) applyDocumentBranding(query.data);
  }, [query.data]);
  const value = useMemo(() => ({ settings, loading: query.isLoading }), [settings, query.isLoading]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext).settings;
export const useSettingsLoading = () => useContext(SettingsContext).loading;

export function formatMoney(value: number, currency: SiteSettings["currency"]): string {
  try {
    return new Intl.NumberFormat(currency.locale || undefined, { style: "currency", currency: currency.code }).format(value);
  } catch {
    return `${currency.code} ${value.toFixed(2)}`;
  }
}

export function useMoney() {
  const { currency } = useSettings();
  return useMemo(() => (value: number) => formatMoney(value, currency), [currency]);
}

/** WCAG contrast ratio between two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const lum = (hex: string) => {
    const n = hex.replace("#", "");
    const [r, g, bl] = [0, 2, 4].map((i) => {
      const c = parseInt(n.slice(i, i + 2), 16) / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}
