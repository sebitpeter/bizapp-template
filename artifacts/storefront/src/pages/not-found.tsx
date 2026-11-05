import { Link } from "wouter";
import { BrandLogo } from "@/components/brand-logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-brand-bg px-6 text-brand-ink">
      <div className="max-w-md text-center">
        <div className="mb-8 flex justify-center"><BrandLogo href="" /></div>
        <p className="mono text-xs font-bold uppercase tracking-[.25em] text-brand-accent-strong">Error 404</p>
        <h1 className="serif mt-3 text-4xl font-semibold tracking-tight">This page doesn't exist.</h1>
        <p className="mt-3 text-brand-muted">The link may be old or mistyped.</p>
        <Link href="/" className="focus-ring mt-8 inline-flex rounded-full bg-brand-primary px-6 py-3 text-sm font-bold text-brand-on-primary hover:bg-brand-primary-hover">Back to the shop</Link>
      </div>
    </main>
  );
}
