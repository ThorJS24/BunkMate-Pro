import { eq, ne } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { semesters, subjects, timetableSlots, settings, SETTINGS_SINGLETON_ID } from '../../../src/db/schema'
import { ensureSettingsRow } from './settings'

export type Semester = typeof semesters.$inferSelect
export type NewSemester = Omit<typeof semesters.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'archived'>
export type SemesterUpdate = Partial<Omit<typeof semesters.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>>

export function listSemesters(db: AppDatabase): Semester[] {
  return db.select().from(semesters).all()
}

export function getSemester(db: AppDatabase, id: number): Semester | undefined {
  return db.select().from(semesters).where(eq(semesters.id, id)).get()
}

/**
 * Only one semester is ever active at a time. Setting one active silently
 * deactivates all the others, and — since so much of the app defaults its
 * "current" view to settings.currentSemester — keeps that setting in sync so
 * the newly active semester is what shows up everywhere on next load.
 */
function activateSemester(db: AppDatabase, id: number, label: string): void {
  ensureSettingsRow(db)
  db.update(semesters).set({ isActive: false }).where(ne(semesters.id, id)).run()
  db.update(settings).set({ currentSemester: label }).where(eq(settings.id, SETTINGS_SINGLETON_ID)).run()
}

export function createSemester(db: AppDatabase, input: NewSemester): Semester {
  const created = db.insert(semesters).values(input).returning().get()
  if (created.isActive) activateSemester(db, created.id, created.label)
  return created
}

export interface RolloverPreview {
  subjects: { name: string; credits: number; category: string | null }[]
  slotCount: number
}

/** What a rollover from `fromLabel` would create, for the confirm screen. */
export function getRolloverPreview(db: AppDatabase, fromLabel: string): RolloverPreview {
  const srcSubjects = db.select().from(subjects).where(eq(subjects.semester, fromLabel)).all()
  const slotCount = db.select().from(timetableSlots).where(eq(timetableSlots.semester, fromLabel)).all().length
  return {
    subjects: srcSubjects.map((s) => ({ name: s.name, credits: s.credits, category: s.category })),
    slotCount,
  }
}

/**
 * Creates a new semester and rolls over ONLY the structure (subjects +
 * timetable) from `fromLabel`. Because this repo scopes subjects/timetable
 * to a semester by label rather than a real foreign key, subjects aren't
 * shared across semesters — so rollover creates BRAND-NEW subject rows
 * (fresh ids, copied name/credits/faculty/category/color/customMinTarget)
 * under the new label, and new timetable slots that reference THOSE new
 * subject ids via an old→new id map. It deliberately does NOT point the new
 * slots at the old semester's subjects, and copies nothing else: attendance,
 * holidays, yellow forms, and exams all start empty in a fresh semester.
 *
 * The whole copy runs in one transaction so a failure can't leave a
 * half-populated semester behind. The new semester is inserted inactive
 * inside the transaction and (if requested) activated afterward through the
 * normal update path, so the "only one active" bookkeeping isn't duplicated.
 */
export function createSemesterWithRollover(db: AppDatabase, input: NewSemester, fromLabel: string): Semester {
  const created = db.transaction((tx) => {
    const sem = tx
      .insert(semesters)
      .values({ ...input, isActive: false })
      .returning()
      .get()

    const idMap = new Map<number, number>()
    for (const s of tx.select().from(subjects).where(eq(subjects.semester, fromLabel)).all()) {
      const ns = tx
        .insert(subjects)
        .values({
          name: s.name,
          semester: sem.label,
          credits: s.credits,
          faculty: s.faculty,
          category: s.category,
          color: s.color,
          customMinTarget: s.customMinTarget,
        })
        .returning()
        .get()
      idMap.set(s.id, ns.id)
    }

    for (const slot of tx.select().from(timetableSlots).where(eq(timetableSlots.semester, fromLabel)).all()) {
      tx.insert(timetableSlots)
        .values({
          semester: sem.label,
          day: slot.day,
          period: slot.period,
          subjectId: slot.subjectId !== null ? (idMap.get(slot.subjectId) ?? null) : null,
          type: slot.type,
          startTime: slot.startTime,
          endTime: slot.endTime,
        })
        .run()
    }

    return sem
  })

  return input.isActive ? updateSemester(db, created.id, { isActive: true }) : created
}

export function updateSemester(db: AppDatabase, id: number, input: SemesterUpdate): Semester {
  const updated = db
    .update(semesters)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(semesters.id, id))
    .returning()
    .get()
  if (input.isActive) activateSemester(db, updated.id, updated.label)
  return updated
}

export function setSemesterArchived(db: AppDatabase, id: number, archived: boolean): Semester {
  // A semester can't be both archived and the active one.
  const patch = archived ? { archived, isActive: false } : { archived }
  return db
    .update(semesters)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(semesters.id, id))
    .returning()
    .get()
}

export interface SemesterDependents {
  subjects: number
  timetableSlots: number
}

export function getSemesterDependents(db: AppDatabase, label: string): SemesterDependents {
  return {
    subjects: db.select().from(subjects).where(eq(subjects.semester, label)).all().length,
    timetableSlots: db.select().from(timetableSlots).where(eq(timetableSlots.semester, label)).all().length,
  }
}

/**
 * Deletes a semester, but only if nothing still references its label —
 * unlike subjects (where deleting cascades on purpose), removing a semester
 * should never silently take subjects/timetable data with it.
 */
export function deleteSemester(db: AppDatabase, id: number): void {
  const semester = getSemester(db, id)
  if (!semester) return
  const dependents = getSemesterDependents(db, semester.label)
  if (dependents.subjects > 0 || dependents.timetableSlots > 0) {
    const parts: string[] = []
    if (dependents.subjects > 0) parts.push(`${dependents.subjects} subject(s)`)
    if (dependents.timetableSlots > 0) parts.push(`${dependents.timetableSlots} timetable slot(s)`)
    throw new Error(
      `Cannot delete semester "${semester.label}" — ${parts.join(' and ')} still reference it. ` +
        `Reassign or delete them first.`,
    )
  }
  db.delete(semesters).where(eq(semesters.id, id)).run()
}

function isoDaysFromToday(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

/**
 * Back-fills the semesters table from whatever free-text semester values
 * already exist on subjects/timetableSlots/settings, so upgrading doesn't
 * strand existing data outside the new entity. Only runs once — if any
 * semester row already exists (fresh install included), it's a no-op.
 * Seeded date ranges are placeholders (the real dates aren't recoverable
 * from free text); users can correct them from the Semesters page.
 */
export function ensureSemestersSeeded(db: AppDatabase): void {
  if (listSemesters(db).length > 0) return

  const labels = new Set<string>()
  for (const row of db.select({ semester: subjects.semester }).from(subjects).all()) labels.add(row.semester)
  for (const row of db.select({ semester: timetableSlots.semester }).from(timetableSlots).all()) {
    labels.add(row.semester)
  }
  const settingsRow = db.select().from(settings).where(eq(settings.id, SETTINGS_SINGLETON_ID)).get()
  if (settingsRow?.currentSemester) labels.add(settingsRow.currentSemester)
  if (labels.size === 0) return

  const sorted = Array.from(labels).sort()
  const activeLabel =
    settingsRow?.currentSemester && sorted.includes(settingsRow.currentSemester)
      ? settingsRow.currentSemester
      : sorted[sorted.length - 1]

  sorted.forEach((label, i) => {
    db.insert(semesters)
      .values({
        number: i + 1,
        label,
        startDate: isoDaysFromToday(-90),
        endDate: isoDaysFromToday(90),
        isActive: label === activeLabel,
      })
      .run()
  })

  if (!settingsRow?.currentSemester) {
    db.update(settings).set({ currentSemester: activeLabel }).where(eq(settings.id, SETTINGS_SINGLETON_ID)).run()
  }
}
