// Pure "day view" attendance logic, shared by the Attendance page, the
// Calendar day-inspector, and the dashboard's "today" strip. No UI/DB imports
// (same discipline as attendance-engine.ts) so every screen derives a class's
// status the exact same way and the auto-mark rule can't drift between them.
//
// The rule (per product spec): for any scheduled class whose time has already
// passed, the student is counted PRESENT by default — unless they have
// explicitly recorded something for that slot (an explicit "absent" is how you
// say "I actually missed it", and an explicit "present" simply stays present).
// Classes still in the future today, or with no known end-time, are "upcoming"
// and are never auto-marked.

import type { AttendanceRecordInput, AttendanceStatus, ScheduledPeriod } from './attendance-engine'

export type DayPeriodStatus = 'present' | 'absent' | 'auto_present' | 'upcoming'

/** A scheduled class period resolved to a concrete status for a given moment. */
export interface DayPeriod extends ScheduledPeriod {
  subjectId: number
  /**
   * present / absent  -> the student has an explicit record for this slot
   * auto_present       -> no record, but the class is in the past (counts as attended)
   * upcoming           -> no record, class hasn't happened yet (or end-time unknown)
   */
  effectiveStatus: DayPeriodStatus
  /** true when `effectiveStatus` comes from an explicit user record. */
  explicit: boolean
}

export type PeriodEndMinutes = Map<number, number> | Record<number, number>

export interface ResolveDayParams {
  /** Scheduled periods (already holiday-filtered) for the date(s) in view. */
  scheduledPeriods: ScheduledPeriod[]
  /** The student's explicit attendance records. */
  records: AttendanceRecordInput[]
  /** Today's date, ISO yyyy-mm-dd, in the student's local timezone. */
  todayIso: string
  /** Minutes since local midnight "now" (e.g. 13:30 -> 810). */
  nowMinutes: number
  /** period number -> the minute-of-day that period ends. Missing => unknown. */
  periodEndMinutes: PeriodEndMinutes
}

function endMinutesOf(map: PeriodEndMinutes, period: number): number | undefined {
  return map instanceof Map ? map.get(period) : map[period]
}

function recordKey(subjectId: number, date: string, period: number): string {
  return `${subjectId}|${date}|${period}`
}

/**
 * Resolves every scheduled *class* period (subjectId !== null) to its
 * effective status for the given "now". Lunch/free slots (subjectId null) are
 * omitted — they aren't attendance-bearing. Pure and deterministic: pass the
 * clock in, no `Date.now()` inside.
 */
export function resolveDayPeriods(params: ResolveDayParams): DayPeriod[] {
  const { scheduledPeriods, records, todayIso, nowMinutes, periodEndMinutes } = params

  const explicit = new Map<string, AttendanceStatus>()
  for (const r of records) explicit.set(recordKey(r.subjectId, r.date, r.period), r.status)

  const out: DayPeriod[] = []
  for (const p of scheduledPeriods) {
    if (p.subjectId === null) continue
    const subjectId = p.subjectId

    const existing = explicit.get(recordKey(subjectId, p.date, p.period))
    let effectiveStatus: DayPeriodStatus
    let isExplicit = false

    if (existing) {
      effectiveStatus = existing
      isExplicit = true
    } else if (p.date < todayIso) {
      effectiveStatus = 'auto_present'
    } else if (p.date > todayIso) {
      effectiveStatus = 'upcoming'
    } else {
      const end = endMinutesOf(periodEndMinutes, p.period)
      effectiveStatus = end !== undefined && nowMinutes >= end ? 'auto_present' : 'upcoming'
    }

    out.push({ ...p, subjectId, effectiveStatus, explicit: isExplicit })
  }
  return out
}

/**
 * The synthetic "present" records implied by the auto-mark rule. Feed these
 * alongside the real records into computeAttendance() to get live attendance
 * that already counts today's finished-but-unmarked classes as attended:
 *
 *   computeAttendance({ records: [...records, ...autoPresentRecords(...)], ... })
 *
 * They carry source-less shape identical to a manual record so the engine
 * treats them uniformly. An explicit "absent" wins because it's already in
 * `records` and this never emits a slot that has any explicit record.
 */
export function autoPresentRecords(params: ResolveDayParams): AttendanceRecordInput[] {
  return resolveDayPeriods(params)
    .filter((p) => p.effectiveStatus === 'auto_present')
    .map((p) => ({
      subjectId: p.subjectId,
      date: p.date,
      period: p.period,
      status: 'present' as const,
      slotId: p.slotId,
    }))
}

/** Convenience: minutes since local midnight for a Date (call-site helper). */
export function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes()
}

export interface PeriodTimeSlot {
  day: string
  period: number
  endTime: string | null
}

/**
 * Builds the `periodEndMinutes` map resolveDayPeriods needs, from a day's
 * timetable slots. Slots with no end time set (or on a different weekday)
 * are left out of the map, which resolveDayPeriods already treats as
 * "unknown end time" -> stays 'upcoming' rather than guessing.
 */
export function buildPeriodEndMinutesForDay(slots: PeriodTimeSlot[], weekday: string): Map<number, number> {
  const map = new Map<number, number>()
  for (const s of slots) {
    if (s.day !== weekday || !s.endTime) continue
    const [hours, minutes] = s.endTime.split(':').map(Number)
    map.set(s.period, hours * 60 + minutes)
  }
  return map
}
