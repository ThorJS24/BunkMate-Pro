import { eq, and, gte, lte, type SQL } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { attendanceRecords } from '../../../src/db/schema'

export type AttendanceRecord = typeof attendanceRecords.$inferSelect
export type NewAttendanceRecord = Omit<typeof attendanceRecords.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>
export type AttendanceRecordUpdate = Partial<NewAttendanceRecord>

export interface AttendanceRecordFilter {
  subjectId?: number
  dateFrom?: string
  dateTo?: string
}

export function listAttendanceRecords(db: AppDatabase, filter: AttendanceRecordFilter = {}): AttendanceRecord[] {
  const conditions: SQL[] = []
  if (filter.subjectId !== undefined) conditions.push(eq(attendanceRecords.subjectId, filter.subjectId))
  if (filter.dateFrom) conditions.push(gte(attendanceRecords.date, filter.dateFrom))
  if (filter.dateTo) conditions.push(lte(attendanceRecords.date, filter.dateTo))

  const query = db.select().from(attendanceRecords)
  if (conditions.length === 0) return query.all()
  return query.where(and(...conditions)).all()
}

export function getAttendanceRecord(db: AppDatabase, id: number): AttendanceRecord | undefined {
  return db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).get()
}

/**
 * Marking the same subject/date/period twice (e.g. from two different
 * screens) updates the existing record instead of erroring on the unique
 * constraint or creating a duplicate.
 */
export function createAttendanceRecord(db: AppDatabase, input: NewAttendanceRecord): AttendanceRecord {
  return db
    .insert(attendanceRecords)
    .values(input)
    .onConflictDoUpdate({
      target: [attendanceRecords.subjectId, attendanceRecords.date, attendanceRecords.period],
      set: { status: input.status, source: input.source, slotId: input.slotId, updatedAt: new Date() },
    })
    .returning()
    .get()
}

export function updateAttendanceRecord(
  db: AppDatabase,
  id: number,
  input: AttendanceRecordUpdate,
): AttendanceRecord {
  return db
    .update(attendanceRecords)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(attendanceRecords.id, id))
    .returning()
    .get()
}

export function deleteAttendanceRecord(db: AppDatabase, id: number): void {
  db.delete(attendanceRecords).where(eq(attendanceRecords.id, id)).run()
}
