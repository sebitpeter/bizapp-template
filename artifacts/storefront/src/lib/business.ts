/**
 * Build-time business config (business/business.config.ts).
 * Words (`copy`), status labels and fonts come from here.
 * Branding that admins can change at runtime comes from useSettings() instead.
 */
import { businessConfig } from "@workspace/business";

export const business = businessConfig;
export const copy = businessConfig.copy;
export const statusLabel = (status: string) =>
  (businessConfig.statusLabels as Record<string, string>)[status] ?? status;
