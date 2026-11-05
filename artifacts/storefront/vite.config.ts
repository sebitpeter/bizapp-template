import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { businessConfig } from "../../business/business.config";

// Read the repo-root .env too (only PORT/BASE_PATH/API_URL are used here; nothing is exposed to the browser).
const rootEnv = path.resolve(import.meta.dirname, "..", "..", ".env");
if (fs.existsSync(rootEnv)) {
  const fromFile = new Map(fs.readFileSync(rootEnv, "utf8").split(/\r?\n/).map((l) => l.match(/^\s*(API_URL|BASE_PATH|WEB_PORT)\s*=\s*(.*?)\s*$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1], m[2]]));
  for (const [k, v] of fromFile) if (!process.env[k] && v) process.env[k] = v;
}

// Sensible defaults so `pnpm dev` works on any machine (Windows included) without extra env vars.
// (PORT from .env belongs to the API, so the web server uses WEB_PORT or the PORT set by the host, e.g. Replit.)
const port = Number(process.env.PORT ?? process.env.WEB_PORT ?? 5173);
if (!Number.isInteger(port) || port <= 0) throw new Error(`Invalid PORT value: "${process.env.PORT}"`);
const basePath = process.env.BASE_PATH ?? "/";
// Where the API runs in development. /api requests are forwarded there.
const apiTarget = process.env.API_URL ?? "http://localhost:8080";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function faviconSvg(): string {
  const { name, colors } = businessConfig.settings;
  const letter = escapeHtml((name.trim()[0] ?? "?").toUpperCase());
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="${colors.primary}"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" font-family="Georgia,serif" font-size="38" font-weight="700" fill="${colors.surface}">${letter}</text></svg>`;
}

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

/**
 * Fills index.html from business/business.config.ts so the very first paint
 * (and link previews / search engines) already show the right name, colours,
 * fonts and favicon. Admin changes made in the browser are applied at runtime.
 */
function businessHtml(): Plugin {
  let isBuild = false;
  return {
    name: "business-html",
    configResolved(config) {
      isBuild = config.command === "build";
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0] !== `${basePath.replace(/\/$/, "")}/favicon.svg`) return next();
        res.setHeader("Content-Type", "image/svg+xml");
        res.end(faviconSvg());
      });
    },
    generateBundle() {
      this.emitFile({ type: "asset", fileName: "favicon.svg", source: faviconSvg() });
    },
    transformIndexHtml(html) {
      const { settings, fonts } = businessConfig;
      const title = escapeHtml(settings.seo.title || settings.name);
      const description = escapeHtml(settings.seo.description);
      const c = settings.colors;
      const vars = `--brand-primary:${c.primary};--brand-accent:${c.accent};--brand-ink:${c.ink};--brand-bg:${c.background};--brand-surface:${c.surface};--app-font-sans:${fonts.sans};--app-font-serif:${fonts.serif};--app-font-mono:${fonts.mono}`;
      const head = [
        isBuild ? `<meta http-equiv="Content-Security-Policy" content="${CSP}" />` : "",
        `<title>${title}</title>`,
        `<meta name="description" content="${description}" />`,
        `<meta name="theme-color" content="${c.primary}" />`,
        `<meta property="og:title" content="${title}" />`,
        `<meta property="og:description" content="${description}" />`,
        `<meta property="og:type" content="website" />`,
        `<meta name="twitter:card" content="summary_large_image" />`,
        `<link rel="icon" type="image/svg+xml" href="${basePath.replace(/\/$/, "")}/favicon.svg" />`,
        fonts.googleFontsUrl
          ? `<link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin /><link rel="stylesheet" href="${escapeHtml(fonts.googleFontsUrl)}" />`
          : "",
        `<style>html:root{${vars.replace(/</g, "")}}</style>`,
      ].filter(Boolean).join("\n    ");
      return html.replace("<!-- business:head -->", head);
    },
  };
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    businessHtml(),
    ...(process.env.NODE_ENV !== "production" && process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-runtime-error-modal").then((m) => m.default()),
          await import("@replit/vite-plugin-cartographer").then((m) => m.cartographer({ root: path.resolve(import.meta.dirname, "..") })),
          await import("@replit/vite-plugin-dev-banner").then((m) => m.devBanner()),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: { strict: true },
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: false } },
  },
});
