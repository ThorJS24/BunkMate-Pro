import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { periodTypeRules, PERIOD_TYPES, type PeriodType } from '../../../src/db/schema'

export type PeriodTypeRule = typeof periodTypeRules.$inferSelect

// Defaults matching the PRD's attendance rules exactly. Table-driven: change
// a bucket here (or via a future settings UI) without touching the
// attendance engine's code.
const DEFAULT_BUCKETS: Record<PeriodType, PeriodTypeRule['bucket']> = {
  class: 'normal',
  project: 'project',
  // mentoring hours don't count toward attendance (user preference) — treated
  // like meetings. Existing installs are migrated by 0014_*.
  mentoring: 'excluded',
  minor: 'project',
  meeting: 'excluded',
  lunch: 'ignored',
}

export function listPeriodTypeRules(db: AppDatabase): PeriodTypeRule[] {
  return db.select().from(periodTypeRules).all()
}

export function ensureDefaultPeriodTypeRules(db: AppDatabase): PeriodTypeRule[] {
  const existing = listPeriodTypeRules(db)
  const existingTypes = new Set(existing.map((r) => r.type))
  const missing = PERIOD_TYPES.filter((type) => !existingTypes.has(type))
  for (const type of missing) {
    db.insert(periodTypeRules).values({ type, bucket: DEFAULT_BUCKETS[type] }).run()
  }
  return missing.length > 0 ? listPeriodTypeRules(db) : existing
}

export function setPeriodTypeRuleBucket(
  db: AppDatabase,
  type: PeriodTypeRule['type'],
  bucket: PeriodTypeRule['bucket'],
): PeriodTypeRule {
  return db
    .update(periodTypeRules)
    .set({ bucket })
    .where(eq(periodTypeRules.type, type))
    .returning()
    .get()
}
