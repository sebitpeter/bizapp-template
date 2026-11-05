import { eq } from "drizzle-orm";
import { db, siteSettingsTable } from "@workspace/db";
import { businessConfig, mergeSettings, siteSettingsSchema, type SiteSettings } from "@workspace/business";

const defaults: SiteSettings = siteSettingsSchema.parse(businessConfig.settings);

export function defaultSettings(): SiteSettings {
  return defaults;
}

export async function loadSettings(): Promise<SiteSettings> {
  const [row] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  return mergeSettings(defaults, row?.data ?? {});
}

export async function saveSettings(settings: SiteSettings): Promise<SiteSettings> {
  await db
    .insert(siteSettingsTable)
    .values({ id: 1, data: settings, updatedAt: new Date() })
    .onConflictDoUpdate({ target: siteSettingsTable.id, set: { data: settings, updatedAt: new Date() } });
  return loadSettings();
}

export async function resetSettings(): Promise<SiteSettings> {
  await db.delete(siteSettingsTable).where(eq(siteSettingsTable.id, 1));
  return defaults;
}
