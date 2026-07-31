import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { settings, SETTINGS_SINGLETON_ID } from '../../../src/db/schema'

export type Settings = typeof settings.$inferSelect
export type SettingsUpdate = Partial<
  Omit<typeof settings.$inferInsert, 'id' | 'updatedAt'>
>

export function ensureSettingsRow(db: AppDatabase): Settings {
  const existing = db.select().from(settings).where(eq(settings.id, SETTINGS_SINGLETON_ID)).get()
  if (existing) return existing
  return db.insert(settings).values({ id: SETTINGS_SINGLETON_ID }).returning().get()
}

export function getSettings(db: AppDatabase): Settings {
  return ensureSettingsRow(db)
}

export function updateSettings(db: AppDatabase, input: SettingsUpdate): Settings {
  ensureSettingsRow(db)
  return db
    .update(settings)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(settings.id, SETTINGS_SINGLETON_ID))
    .returning()
    .get()
}
