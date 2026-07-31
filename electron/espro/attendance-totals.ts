// Pure parsing + comparison for the ESPRO "official totals vs BunkMate"
// check. ESPRO's API only cleanly exposes per-subject TOTALS (hours
// scheduled/attended/percentage) — there's no enumerable list of present
// periods (only an absence-only, per-date drill-down), so this deliberately
// stays a trust check rather than trying to import per-period records: it
// would mean fabricating specific dates/periods BunkMate can't verify.

export interface EsproSubjectTotal {
  courseCode: string | null
  courseName: string
  totalHoursScheduled: number
  totalHoursAttended: number
  totalPercentage: number
}

/**
 * Parses a `getCourseWiseAttendance` response (confirmed shape, 2026-07-29)
 * into totals. Tolerant of unexpected shapes — rows that don't look right
 * are skipped rather than throwing, since this is a best-effort comparison,
 * not a data-integrity-critical import.
 */
export function parseCourseWiseAttendance(json: unknown): EsproSubjectTotal[] {
  if (!Array.isArray(json)) return []
  const rows: EsproSubjectTotal[] = []
  for (const item of json) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const courseName = typeof r.courseName === 'string' ? r.courseName.trim() : ''
    const totalHoursScheduled = Number(r.totalHoursScheduled)
    const totalHoursAttended = Number(r.totalHoursAttended)
    const totalPercentage = Number(r.totalPercentage)
    if (
      !courseName ||
      !Number.isFinite(totalHoursScheduled) ||
      !Number.isFinite(totalHoursAttended) ||
      !Number.isFinite(totalPercentage)
    ) {
      continue
    }
    rows.push({
      courseCode: typeof r.courseCode === 'string' && r.courseCode ? r.courseCode : null,
      courseName,
      totalHoursScheduled,
      totalHoursAttended,
      totalPercentage,
    })
  }
  return rows
}

export interface LocalSubjectTotal {
  subjectName: string
  attended: number
  total: number
  /** null when total is 0 — nothing to compute a percentage from yet. */
  percentage: number | null
}

export type ComparisonStatus = 'match' | 'mismatch' | 'espro-only' | 'local-only'

export interface AttendanceComparisonRow {
  subjectName: string
  status: ComparisonStatus
  espro: { attended: number; total: number; percentage: number } | null
  local: { attended: number; total: number; percentage: number | null } | null
}

/**
 * Finds the local subject an ESPRO course refers to. BunkMate has no
 * separate course-code field — users commonly fold the code into the
 * subject name itself (e.g. "Data Engineering (CSE731)"), while ESPRO gives
 * a plain name ("DATA ENGINEERING") and the code separately ("CSE731"). So a
 * bare exact-name match misses almost everything in practice; tried in order
 * of reliability:
 *   1. ESPRO's course code appears anywhere in the local subject's name —
 *      most reliable when available, since codes are specific/unique.
 *   2. Exact name match (case-insensitive).
 *   3. One name contains the other (handles a trailing "(CODE)" or similar
 *      padding without relying on the code being present).
 */
function findLocalMatch(
  espro: EsproSubjectTotal,
  localTotals: LocalSubjectTotal[],
  used: Set<LocalSubjectTotal>,
): LocalSubjectTotal | undefined {
  const codeLower = espro.courseCode?.toLowerCase()
  const nameLower = espro.courseName.toLowerCase()
  const available = localTotals.filter((l) => !used.has(l))

  if (codeLower) {
    const byCode = available.find((l) => l.subjectName.toLowerCase().includes(codeLower))
    if (byCode) return byCode
  }
  const exact = available.find((l) => l.subjectName.toLowerCase() === nameLower)
  if (exact) return exact
  return available.find((l) => {
    const localLower = l.subjectName.toLowerCase()
    return localLower.includes(nameLower) || nameLower.includes(localLower)
  })
}

/**
 * Matches ESPRO's official totals against BunkMate's own locally-computed
 * totals (see findLocalMatch for how). A subject present on only one side is
 * surfaced as espro-only/local-only rather than silently dropped, so the
 * user can see what's out of sync (e.g. a subject renamed locally, or one
 * ESPRO hasn't scheduled yet).
 */
export function compareAttendanceTotals(params: {
  esproTotals: EsproSubjectTotal[]
  localTotals: LocalSubjectTotal[]
  /** Percentage-point gap at or above which a match is flagged as a mismatch. */
  toleranceP: number
}): AttendanceComparisonRow[] {
  const { esproTotals, localTotals, toleranceP } = params
  const matchedLocals = new Set<LocalSubjectTotal>()
  const rows: AttendanceComparisonRow[] = []

  for (const e of esproTotals) {
    const local = findLocalMatch(e, localTotals, matchedLocals)
    const esproEntry = { attended: e.totalHoursAttended, total: e.totalHoursScheduled, percentage: e.totalPercentage }
    if (!local) {
      rows.push({ subjectName: e.courseName, status: 'espro-only', espro: esproEntry, local: null })
      continue
    }
    matchedLocals.add(local)
    const localEntry = { attended: local.attended, total: local.total, percentage: local.percentage }
    const gap = local.percentage === null ? Infinity : Math.abs(local.percentage - e.totalPercentage)
    rows.push({
      subjectName: e.courseName,
      status: gap <= toleranceP ? 'match' : 'mismatch',
      espro: esproEntry,
      local: localEntry,
    })
  }

  for (const l of localTotals) {
    if (matchedLocals.has(l)) continue
    rows.push({
      subjectName: l.subjectName,
      status: 'local-only',
      espro: null,
      local: { attended: l.attended, total: l.total, percentage: l.percentage },
    })
  }

  return rows
}
