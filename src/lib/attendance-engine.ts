// Pure attendance calculation engine. No UI or DB imports on purpose: the
// dashboard, the simulator/predictor (Phase 5), and analytics all need the
// exact same math, and the safest way to guarantee that is one module with
// no side effects that every caller feeds plain data into.

export type AttendanceStatus = 'present' | 'absent'
export type YellowFormStatus = 'pending' | 'approved' | 'rejected'

// Which bucket a period type falls into. Table-driven (see
// electron/db/repositories/period-type-rules.ts) so a new institution-
// specific period type can be added without touching this file:
//   - 'excluded': happened, but never counts (e.g. meetings)
//   - 'project':  counts toward the subject total AND a separate "Project
//                 Work" sub-total (e.g. mentoring, minor)
//   - 'normal':   counts toward the subject total only (e.g. class)
//   - 'ignored':  not a class at all, never shown or counted (e.g. lunch)
export type AttendanceBucket = 'excluded' | 'project' | 'normal' | 'ignored'

export interface PeriodTypeRule {
  type: string
  bucket: AttendanceBucket
}

// A holiday's `type` determines whether it excludes scheduled periods.
// `working_saturday` is the one deliberate exception: it marks a Saturday
// that has been redesignated a working day (compensating for a holiday
// elsewhere in the term), so unlike the other types it does NOT exclude
// periods on that date.
export type HolidayType = 'public' | 'university' | 'working_saturday' | 'custom'
const HOLIDAY_TYPES_THAT_EXCLUDE = new Set<HolidayType>(['public', 'university', 'custom'])

export interface HolidayInput {
  date: string
  type: string
}

export interface TimetableSlotInput {
  id: number
  subjectId: number | null
  type: string
}

export interface AttendanceRecordInput {
  subjectId: number
  date: string
  period: number
  status: AttendanceStatus
  slotId: number | null
}

export interface YellowFormInput {
  id: number
  subjectId: number
  date: string
  /** null means the approval covers every period that subject has that day. */
  period: number | null
  status: YellowFormStatus
}

export interface BucketStats {
  total: number
  attended: number
  /** null when total is 0 (nothing to compute a percentage from yet). */
  percentage: number | null
}

export interface SubjectAttendance {
  subjectId: number
  /** Overall stats: 'normal' + 'project' bucket periods combined. */
  overall: BucketStats
  /** 'class'-type (bucket 'normal') periods only. */
  classWork: BucketStats
  /** Mentoring/minor (bucket 'project') periods only. */
  projectWork: BucketStats
}

function resolveBucket(type: string, rules: PeriodTypeRule[]): AttendanceBucket {
  return rules.find((r) => r.type === type)?.bucket ?? 'normal'
}

function isExcludedHoliday(date: string, holidays: HolidayInput[]): boolean {
  return holidays.some((h) => h.date === date && HOLIDAY_TYPES_THAT_EXCLUDE.has(h.type as HolidayType))
}

function isApprovedByYellowForm(
  record: AttendanceRecordInput,
  yellowForms: YellowFormInput[],
): boolean {
  return yellowForms.some(
    (f) =>
      f.status === 'approved' &&
      f.subjectId === record.subjectId &&
      f.date === record.date &&
      (f.period === null || f.period === record.period),
  )
}

function emptyStats(): BucketStats {
  return { total: 0, attended: 0, percentage: null }
}

function addToStats(stats: BucketStats, attended: boolean): void {
  stats.total += 1
  if (attended) stats.attended += 1
}

function finalizeStats(stats: BucketStats): BucketStats {
  return { ...stats, percentage: stats.total === 0 ? null : (stats.attended / stats.total) * 100 }
}

export interface ComputeAttendanceParams {
  records: AttendanceRecordInput[]
  slots: TimetableSlotInput[]
  holidays: HolidayInput[]
  yellowForms: YellowFormInput[]
  rules: PeriodTypeRule[]
}

/**
 * Computes live, per-subject attendance stats from raw records. Never
 * mutates or persists a percentage anywhere — callers recompute from source
 * data every time, per the "percentages are never stored" rule.
 */
export function computeAttendance(params: ComputeAttendanceParams): Map<number, SubjectAttendance> {
  const { records, slots, holidays, yellowForms, rules } = params
  const slotsById = new Map(slots.map((s) => [s.id, s]))

  const bySubject = new Map<
    number,
    { overall: BucketStats; classWork: BucketStats; projectWork: BucketStats }
  >()

  const getOrCreate = (subjectId: number) => {
    let entry = bySubject.get(subjectId)
    if (!entry) {
      entry = { overall: emptyStats(), classWork: emptyStats(), projectWork: emptyStats() }
      bySubject.set(subjectId, entry)
    }
    return entry
  }

  for (const record of records) {
    if (isExcludedHoliday(record.date, holidays)) continue

    const slot = record.slotId !== null ? slotsById.get(record.slotId) : undefined
    const periodType = slot?.type ?? 'class'
    const bucket = resolveBucket(periodType, rules)
    if (bucket === 'excluded' || bucket === 'ignored') continue

    const attended = record.status === 'present' || isApprovedByYellowForm(record, yellowForms)
    const entry = getOrCreate(record.subjectId)

    addToStats(entry.overall, attended)
    if (bucket === 'project') {
      addToStats(entry.projectWork, attended)
    } else {
      addToStats(entry.classWork, attended)
    }
  }

  const result = new Map<number, SubjectAttendance>()
  for (const [subjectId, entry] of bySubject) {
    result.set(subjectId, {
      subjectId,
      overall: finalizeStats(entry.overall),
      classWork: finalizeStats(entry.classWork),
      projectWork: finalizeStats(entry.projectWork),
    })
  }
  return result
}

/** Aggregates per-subject stats into a single overall figure (e.g. for the dashboard header). */
export function aggregateOverall(bySubject: Map<number, SubjectAttendance>): BucketStats {
  const stats = emptyStats()
  for (const s of bySubject.values()) {
    stats.total += s.overall.total
    stats.attended += s.overall.attended
  }
  return finalizeStats(stats)
}

export interface SubjectMinTargetInput {
  customMinTarget: number | null
}

/**
 * Resolves the effective minimum target for a subject: its own override if
 * set, otherwise the settings-wide default subject target. This is the one
 * place that decides "which target applies here" — callers should never
 * inline `subject.customMinTarget ?? subjectMinTarget` themselves, so the
 * fallback rule can't drift between the dashboard, notifications, analytics,
 * and reports.
 */
export function resolveSubjectMinTarget(
  subject: SubjectMinTargetInput,
  defaultSubjectMinTarget: number,
): number {
  return subject.customMinTarget ?? defaultSubjectMinTarget
}

/**
 * How many more (conducted-but-absent) classes can happen from here while
 * attendance stays at or above `targetPercent`, assuming no more classes are
 * ever attended. Returns 0 if already below target.
 */
export function computeSafeBunkCount(attended: number, total: number, targetPercent: number): number {
  if (targetPercent <= 0) return Infinity
  if (targetPercent >= 100) return 0
  const maxTotal = Math.floor((attended * 100) / targetPercent)
  return Math.max(0, maxTotal - total)
}

/**
 * How many consecutive future classes must be attended (assuming perfect
 * attendance from here) to reach `targetPercent`. Returns 0 if already at or
 * above target.
 */
export function computeClassesNeededToReachTarget(
  attended: number,
  total: number,
  targetPercent: number,
): number {
  if (targetPercent <= 0) return 0
  const currentPercent = total === 0 ? 100 : (attended / total) * 100
  if (currentPercent >= targetPercent) return 0

  // Smallest n such that (attended + n) / (total + n) >= targetPercent / 100
  const p = targetPercent / 100
  const numerator = p * total - attended
  const denominator = 1 - p
  if (denominator <= 0) return Infinity
  return Math.max(0, Math.ceil(numerator / denominator))
}

// --- Future-schedule projection (Simulator / Leave Planner) ---------------
//
// The simulator doesn't need a separate computation path: a "what if"
// scenario is just the real records plus a set of hypothetical ones for
// dates that haven't happened yet, run through the exact same
// computeAttendance(). enumerateScheduledPeriods() is the one new primitive
// that requires — turning the recurring weekly timetable into concrete
// dated periods over a range, honoring holiday exclusion.

export type Weekday = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat'

const WEEKDAY_BY_JS_DAY: Record<number, Weekday | null> = {
  0: null,
  1: 'mon',
  2: 'tue',
  3: 'wed',
  4: 'thu',
  5: 'fri',
  6: 'sat',
}

/**
 * Returns null for Sunday (the timetable only models Mon-Sat). Takes an ISO
 * yyyy-mm-dd string rather than a Date so callers can't accidentally hand in
 * a local-time Date and get a day shifted by their timezone offset — this
 * always resolves the weekday as UTC-anchored, matching how dates are
 * stored (plain date strings, no time-of-day) everywhere else in the app.
 */
export function jsDayToWeekday(dateIso: string): Weekday | null {
  return WEEKDAY_BY_JS_DAY[new Date(`${dateIso}T00:00:00Z`).getUTCDay()]
}

export interface TimetableSlotWithSchedule extends TimetableSlotInput {
  day: Weekday
  period: number
}

export interface ScheduledPeriod {
  date: string
  day: Weekday
  period: number
  subjectId: number | null
  type: string
  slotId: number
}

function groupSlotsByDay(
  slots: TimetableSlotWithSchedule[],
): Map<Weekday, TimetableSlotWithSchedule[]> {
  const slotsByDay = new Map<Weekday, TimetableSlotWithSchedule[]>()
  for (const slot of slots) {
    const list = slotsByDay.get(slot.day)
    if (list) list.push(slot)
    else slotsByDay.set(slot.day, [slot])
  }
  return slotsByDay
}

function scheduledPeriodsOnDate(
  dateIso: string,
  slotsByDay: Map<Weekday, TimetableSlotWithSchedule[]>,
  holidays: HolidayInput[],
): ScheduledPeriod[] {
  const weekday = jsDayToWeekday(dateIso)
  if (!weekday || isExcludedHoliday(dateIso, holidays)) return []
  return (slotsByDay.get(weekday) ?? []).map((slot) => ({
    date: dateIso,
    day: weekday,
    period: slot.period,
    subjectId: slot.subjectId,
    type: slot.type,
    slotId: slot.id,
  }))
}

/**
 * Expands the recurring weekly timetable into concrete dated periods
 * between startDate and endDate (both inclusive, ISO yyyy-mm-dd), skipping
 * dates excluded by a holiday.
 */
export function enumerateScheduledPeriods(params: {
  slots: TimetableSlotWithSchedule[]
  holidays: HolidayInput[]
  startDate: string
  endDate: string
}): ScheduledPeriod[] {
  const { slots, holidays, startDate, endDate } = params
  const slotsByDay = groupSlotsByDay(slots)

  const result: ScheduledPeriod[] = []
  const cursor = new Date(`${startDate}T00:00:00Z`)
  const end = new Date(`${endDate}T00:00:00Z`)
  while (cursor <= end) {
    const iso = cursor.toISOString().slice(0, 10)
    result.push(...scheduledPeriodsOnDate(iso, slotsByDay, holidays))
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  return result
}

/**
 * Same as enumerateScheduledPeriods, but for an arbitrary (not necessarily
 * contiguous) set of dates — used for leave plans, which store a list of
 * individually chosen dates rather than a start/end range.
 */
export function scheduledPeriodsForDates(params: {
  slots: TimetableSlotWithSchedule[]
  holidays: HolidayInput[]
  dates: string[]
}): ScheduledPeriod[] {
  const { slots, holidays, dates } = params
  const slotsByDay = groupSlotsByDay(slots)
  return dates.flatMap((date) => scheduledPeriodsOnDate(date, slotsByDay, holidays))
}

/** Turns scheduled periods into hypothetical attendance records under a single assumption. */
export function projectRecords(
  periods: ScheduledPeriod[],
  status: AttendanceStatus,
): AttendanceRecordInput[] {
  return periods
    .filter((p): p is ScheduledPeriod & { subjectId: number } => p.subjectId !== null)
    .map((p) => ({
      subjectId: p.subjectId,
      date: p.date,
      period: p.period,
      status,
      slotId: p.slotId,
    }))
}
