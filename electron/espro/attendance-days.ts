// Pure parsing + comparison for ESPRO's day-wise and per-day-period
// attendance endpoints — a deeper trust check than attendance-totals.ts's
// per-subject totals: this compares actual dates and, for any date that
// doesn't line up, the period-by-period detail for that date. Still a trust
// check, not an import (see attendance-totals.ts's header comment for why).

export interface EsproDayCount {
  date: string
  present: number
  absent: number
}

/**
 * Parses a `getPerDayAttendanceCount` response (confirmed shape, 2026-07-31):
 * one row per date the student had any class, with present/absent hour
 * counts aggregated across every subject that day. Rows with a null/missing
 * date are skipped — nothing to key a comparison on.
 */
export function parsePerDayAttendanceCount(json: unknown): EsproDayCount[] {
  if (!Array.isArray(json)) return []
  const rows: EsproDayCount[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const date = typeof r.date === 'string' ? r.date : null
    const rawPresent = Number(r.presentCount)
    const cocurricular = Number(r.cocurricularCount ?? 0)
    const medical = Number(r.medicalLeaveCount ?? 0)
    const absent = Number(r.absentCount)
    if (!date || !Number.isFinite(rawPresent) || !Number.isFinite(absent)) continue
    const present = (Number.isFinite(rawPresent) ? rawPresent : 0) + (Number.isFinite(cocurricular) ? cocurricular : 0) + (Number.isFinite(medical) ? medical : 0)
    rows.push({ date, present, absent })
  }
  return rows
}

export interface EsproPeriodDetail {
  courseCode: string | null
  courseName: string
  periodName: string
  periodStartTime: string
  periodEndTime: string
  isPresent: boolean
  isCocurricular?: boolean
  isMedical?: boolean
  attendanceType: string
}

/**
 * Parses a `getPerDayAttendanceDetails` response (confirmed shape,
 * 2026-07-31): one row per scheduled period on the single date that was
 * requested (the date itself isn't in the row — it's implied by the
 * request's startDate, confirmed since no date field exists on any row).
 */
export function parsePerDayAttendanceDetails(json: unknown): EsproPeriodDetail[] {
  if (!Array.isArray(json)) return []
  const rows: EsproPeriodDetail[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const courseName = typeof r.courseName === 'string' ? r.courseName.trim() : ''
    const periodStartTime = typeof r.periodStartTime === 'string' ? r.periodStartTime : ''
    const periodEndTime = typeof r.periodEndTime === 'string' ? r.periodEndTime : ''
    if (!courseName || !periodStartTime || !periodEndTime) continue
    const isCocurricular = r.isCocurricular === true
    const isMedical = r.isMedical === true
    rows.push({
      courseCode: typeof r.courseCode === 'string' && r.courseCode ? r.courseCode : null,
      courseName,
      periodName: typeof r.periodName === 'string' ? r.periodName : '',
      periodStartTime,
      periodEndTime,
      isPresent: r.isPresent === true || isCocurricular || isMedical,
      isCocurricular,
      isMedical,
      attendanceType: typeof r.attendanceType === 'string' ? r.attendanceType : '',
    })
  }
  return rows
}

export type DayComparisonStatus = 'match' | 'mismatch' | 'espro-only' | 'local-only'

export interface LocalDayCount {
  date: string
  present: number
  absent: number
}

export interface DayComparisonRow {
  date: string
  status: DayComparisonStatus
  espro: { present: number; absent: number } | null
  local: { present: number; absent: number } | null
}

/**
 * Matches ESPRO's day-wise present/absent counts against BunkMate's own,
 * date by date. Unlike the subject-name fuzzy matching in
 * attendance-totals.ts, dates need no matching heuristic — an ISO date is
 * either present on both sides or it isn't.
 */
export function compareDayAttendance(params: { esproDays: EsproDayCount[]; localDays: LocalDayCount[] }): DayComparisonRow[] {
  const { esproDays, localDays } = params
  const localByDate = new Map(localDays.map((d) => [d.date, d]))
  const seenLocalDates = new Set<string>()
  const rows: DayComparisonRow[] = []

  for (const e of esproDays) {
    const local = localByDate.get(e.date)
    if (!local) {
      rows.push({ date: e.date, status: 'espro-only', espro: { present: e.present, absent: e.absent }, local: null })
      continue
    }
    seenLocalDates.add(e.date)
    const matches = local.present === e.present && local.absent === e.absent
    rows.push({
      date: e.date,
      status: matches ? 'match' : 'mismatch',
      espro: { present: e.present, absent: e.absent },
      local: { present: local.present, absent: local.absent },
    })
  }

  for (const l of localDays) {
    if (seenLocalDates.has(l.date)) continue
    rows.push({ date: l.date, status: 'local-only', espro: null, local: { present: l.present, absent: l.absent } })
  }

  return rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
}

export interface DayComparisonSummary {
  total: number
  match: number
  mismatch: number
  esproOnly: number
  localOnly: number
}

/** Always-computed counts, independent of any capping/filtering applied to the row list for display. */
export function summarizeDayComparison(rows: DayComparisonRow[]): DayComparisonSummary {
  const summary: DayComparisonSummary = { total: rows.length, match: 0, mismatch: 0, esproOnly: 0, localOnly: 0 }
  for (const r of rows) {
    if (r.status === 'match') summary.match++
    else if (r.status === 'mismatch') summary.mismatch++
    else if (r.status === 'espro-only') summary.esproOnly++
    else summary.localOnly++
  }
  return summary
}

export interface LocalPeriodRecord {
  subjectName: string
  period: number
  startTime: string | null
  endTime: string | null
  status: 'present' | 'absent'
}

/**
 * Both sides' raw period lists for one date, shown side by side rather than
 * auto-joined into a single row-per-period table: ESPRO's own period
 * numbering doesn't line up with BunkMate's (confirmed from real captures —
 * a lunch break shifts everything after it by one on ESPRO's side), so
 * matching by number would be wrong and matching by time is only reliable
 * when this semester's period times have been allocated. Forcing a fuzzy
 * per-period match risks reporting a false "mismatch" that's really just a
 * matching-algorithm gap — not honest for a trust-check feature.
 */
export interface DayPeriodDetail {
  date: string
  espro: EsproPeriodDetail[]
  local: LocalPeriodRecord[]
}

// --- Auto-sync (writes real attendance records) ---------------------------
//
// Unlike the read-only trust check above, this DOES turn ESPRO's data into
// attendance records — the user explicitly asked for ESPRO to be the
// primary source instead of manual marking, wherever ESPRO actually has
// data for a period. getPerDayAttendanceDetails' `isPresent` is explicit per
// period (not inferred), so both present and absent rows are equally
// trustworthy to write — this is a real sync, not the "can't honestly turn
// absence-only data into per-period records" case attendance-totals.ts
// documents for the totals comparison.

export interface LocalSubjectRef {
  id: number
  name: string
}

/**
 * Same code-in-name / exact / substring matching heuristic as
 * attendance-totals.ts's findLocalMatch, generalized to work off a plain
 * subject list instead of totals rows (kept separate rather than shared to
 * avoid touching that already-tested matching path for the totals feature).
 */
export function matchEsproCourseToLocalSubject(
  courseCode: string | null,
  courseName: string,
  candidates: LocalSubjectRef[],
): LocalSubjectRef | undefined {
  const codeLower = courseCode?.toLowerCase()
  const nameLower = courseName.toLowerCase()

  if (codeLower) {
    const byCode = candidates.find((c) => c.name.toLowerCase().includes(codeLower))
    if (byCode) return byCode
  }
  const exact = candidates.find((c) => c.name.toLowerCase() === nameLower)
  if (exact) return exact
  return candidates.find((c) => {
    const l = c.name.toLowerCase()
    return l.includes(nameLower) || nameLower.includes(l)
  })
}

/** Finds which BunkMate period number starts at the given "HH:MM" clock time. */
export function periodNumberForTime(periodTimes: { period: number; startTime: string }[], time: string): number | undefined {
  return periodTimes.find((p) => p.startTime === time)?.period
}

export type SyncPlanAction = 'create' | 'update' | 'unchanged'

export interface EsproSyncPlanEntry {
  date: string
  period: number
  subjectId: number
  subjectName: string
  status: 'present' | 'absent'
  action: SyncPlanAction
}

/**
 * Turns one date's ESPRO period detail into concrete attendance-record
 * writes. A period is skipped (not silently guessed) when its course can't
 * be confidently matched to a local subject, or its clock time doesn't line
 * up with any of this semester's allocated period times — both are
 * surfaced back to the caller via `unmatched` so a user can see what wasn't
 * synced instead of it just vanishing.
 */
export function planEsproSyncForDate(params: {
  date: string
  esproPeriods: EsproPeriodDetail[]
  localSubjects: LocalSubjectRef[]
  periodTimes: { period: number; startTime: string }[]
  /** Existing local status keyed by `${subjectId}:${period}` for this date. */
  existingByPeriod: Map<string, 'present' | 'absent'>
}): { entries: EsproSyncPlanEntry[]; unmatched: EsproPeriodDetail[] } {
  const { date, esproPeriods, localSubjects, periodTimes, existingByPeriod } = params
  const entries: EsproSyncPlanEntry[] = []
  const unmatched: EsproPeriodDetail[] = []

  for (const p of esproPeriods) {
    const subject = matchEsproCourseToLocalSubject(p.courseCode, p.courseName, localSubjects)
    const period = periodNumberForTime(periodTimes, p.periodStartTime)
    if (!subject || period === undefined) {
      unmatched.push(p)
      continue
    }
    const isDutyLeave = p.isCocurricular || p.isMedical || (!!p.attendanceType && /duty|co-curricular|excused|yellow|leave|\bod\b/i.test(p.attendanceType))
    const status: 'present' | 'absent' = (p.isPresent || isDutyLeave) ? 'present' : 'absent'
    const existing = existingByPeriod.get(`${subject.id}:${period}`)
    const action: SyncPlanAction = existing === undefined ? 'create' : existing === status ? 'unchanged' : 'update'
    entries.push({ date, period, subjectId: subject.id, subjectName: subject.name, status, action })
  }

  return { entries, unmatched }
}
