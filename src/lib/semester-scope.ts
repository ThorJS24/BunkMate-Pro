/**
 * Scopes a flat attendance-records list down to only the given subject ids.
 * computeAttendance() resolves period-type via slotId lookup only — it does
 * not check subject membership against the `slots` array passed alongside
 * it — so any call site that reads directly from the attendance-records
 * store (which has no semester concept at all; see AttendanceRecordFilter
 * in electron/db/repositories/attendance-records.ts) must apply this before
 * feeding records into computeAttendance()/aggregateOverall(), or a record
 * for a different semester's subject silently pollutes the total.
 */
export function scopeRecordsToSubjects<T extends { subjectId: number }>(records: T[], subjectIds: Iterable<number>): T[] {
  const ids = new Set(subjectIds)
  return records.filter((r) => ids.has(r.subjectId))
}
