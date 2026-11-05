import { Link } from "wouter";
import type { SiteSettings } from "@workspace/api-client-react";
import { useSettings } from "@/lib/theme";

/** Logo image if one is uploaded, otherwise a monogram + the business name. */
export function BrandLogo({ dark = false, settings: override, href = "/", compact = false }: { dark?: boolean; settings?: SiteSettings; href?: string; compact?: boolean }) {
  const current = useSettings();
  const s = override ?? current;
  const initial = (s.name.trim()[0] ?? "?").toUpperCase();
  const content = (
    <>
      {s.logoUrl ? (
        <img src={s.logoUrl} alt="" className="h-10 w-10 shrink-0 rounded-[13px] object-contain" />
      ) : (
        <span className={`serif grid h-10 w-10 shrink-0 place-items-center rounded-[13px] text-xl font-bold ${dark ? "bg-brand-accent text-brand-ink" : "bg-brand-primary text-brand-on-primary"}`} aria-hidden>
          {initial}
        </span>
      )}
      {!compact && (
        <span className="min-w-0 leading-none">
          <strong className="serif block truncate text-[22px] font-semibold tracking-[-.04em]">{s.name}</strong>
          {s.tagline && <small className={`mono block truncate text-[8px] uppercase tracking-[.22em] ${dark ? "text-brand-on-ink" : "text-brand-muted"}`}>{s.tagline}</small>}
        </span>
      )}
    </>
  );
  const cls = `flex min-w-0 items-center gap-3 ${dark ? "text-brand-surface" : "text-brand-ink"}`;
  return href ? (
    <Link href={href} className={cls} aria-label={`${s.name} home`} data-testid="link-logo">{content}</Link>
  ) : (
    <span className={cls}>{content}</span>
  );
}
