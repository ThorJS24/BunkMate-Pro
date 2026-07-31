import { eq, and } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { timetableSlots } from '../../../src/db/schema'

export type TimetableSlot = typeof timetableSlots.$inferSelect
export type NewTimetableSlot = Omit<typeof timetableSlots.$inferInsert, 'id' | 'createdAt'>
export type TimetableSlotUpdate = Partial<NewTimetableSlot>

export function listTimetableSlots(db: AppDatabase, opts: { semester: string }): TimetableSlot[] {
  return db.select().from(timetableSlots).where(eq(timetableSlots.semester, opts.semester)).all()
}

export function getTimetableSlot(db: AppDatabase, id: number): TimetableSlot | undefined {
  return db.select().from(timetableSlots).where(eq(timetableSlots.id, id)).get()
}

/** Assigning a slot that already exists for that semester/day/period updates it instead of duplicating. */
export function createTimetableSlot(db: AppDatabase, input: NewTimetableSlot): TimetableSlot {
  return db
    .insert(timetableSlots)
    .values(input)
    .onConflictDoUpdate({
      target: [timetableSlots.semester, timetableSlots.day, timetableSlots.period],
      set: {
        subjectId: input.subjectId,
        type: input.type,
        startTime: input.startTime,
        endTime: input.endTime,
      },
    })
    .returning()
    .get()
}

export function updateTimetableSlot(db: AppDatabase, id: number, input: TimetableSlotUpdate): TimetableSlot {
  return db.update(timetableSlots).set(input).where(eq(timetableSlots.id, id)).returning().get()
}

export function deleteTimetableSlot(db: AppDatabase, id: number): void {
  db.delete(timetableSlots).where(eq(timetableSlots.id, id)).run()
}

export function deleteTimetableSlotsForSemester(db: AppDatabase, semester: string): void {
  db.delete(timetableSlots).where(eq(timetableSlots.semester, semester)).run()
}

export function findSlot(
  db: AppDatabase,
  opts: { semester: string; day: TimetableSlot['day']; period: number },
): TimetableSlot | undefined {
  return db
    .select()
    .from(timetableSlots)
    .where(
      and(
        eq(timetableSlots.semester, opts.semester),
        eq(timetableSlots.day, opts.day),
        eq(timetableSlots.period, opts.period),
      ),
    )
    .get()
}
