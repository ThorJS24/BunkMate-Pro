// ESPRO attendance-totals comparison (main process). Logs in, fetches
// ESPRO's official per-subject totals, and compares them against BunkMate's
// own locally-computed totals for the same semester — a trust check, not an
// import. See attendance-totals.ts for why: ESPRO doesn't expose an
// enumerable list of present periods (only an absence-only, per-date
// drill-down), so there's no honest way to turn its data into per-period
// attendance records without fabricating dates/periods BunkMate can't verify.
import type { AppDatabase } from '../db/client'
import {
  subjectsRepo,
  semestersRepo,
  attendanceRecordsRepo,
  timetableSlotsRepo,
  holidaysRepo,
  yellowFormsRepo,
  periodTypeRulesRepo,
} from '../db/repositories'
import { computeAttendance } from '../../src/lib/attendance-engine'
import { loadEsproCredential, readEsproSessionId, saveEsproSessionId } from './credential-store'
import { esproLogin, httpRequest, generateDPoPProof, type EsproSession } from './login'
import { EsproLoginError } from './http-util'
import { allocateEvenPeriodTimes } from '../../src/lib/period-time-allocation'
import {
  parseCourseWiseAttendance,
  compareAttendanceTotals,
  type AttendanceComparisonRow,
  type LocalSubjectTotal,
} from './attendance-totals'
import {
  parsePerDayAttendanceCount,
  parsePerDayAttendanceDetails,
  compareDayAttendance,
  planEsproSyncForDate,
  matchEsproCourseToLocalSubject,
  periodNumberForTime,
  type DayComparisonRow,
  type LocalDayCount,
  type LocalPeriodRecord,
  type LocalSubjectRef,
  type DayPeriodDetail,
} from './attendance-days'

// CONFIRMED 2026-07-29 via a real captured request (URL + method, from
// DevTools' Headers panel — a live login/session run, not an inference).
// Third origin, separate from the SPA (:444) and Keycloak (:8010).
const ATTENDANCE_SERVICE_BASE =
  'https://espro.christuniversity.in:84/Protected/ClassRoomAttendanceServices/Student/StudentAttendance'

function assertEsproResponse(res: { status: number; body: string }, endpointName: string): unknown {
  if (res.status === 401 || res.status === 403) {
    throw new Error(`ESPRO authorization failed (HTTP ${res.status}). Please check your login credentials in Settings.`)
  }
  if (res.status >= 500) {
    throw new Error(`ESPRO university server error (HTTP ${res.status}). The portal may be down or under maintenance.`)
  }
  if (res.status !== 200) {
    throw new Error(`ESPRO ${endpointName} returned unexpected status HTTP ${res.status}.`)
  }
  try {
    return JSON.parse(res.body)
  } catch {
    throw new Error(`ESPRO ${endpointName} response wasn't valid JSON.`)
  }
}

function buildAuthHeaders(session: EsproSession | string, url: string): Record<string, string> {
  if (typeof session === 'string') {
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session}` }
  }
  const authScheme = session.tokenType || 'Bearer'
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization: `${authScheme} ${session.accessToken}`,
  }
  if (session.dpopKeys) {
    headers.DPoP = generateDPoPProof('POST', url, session.dpopKeys)
  }
  return headers
}

async function fetchCourseWiseAttendance(session: EsproSession | string, sessionId: string): Promise<unknown> {
  const url = `${ATTENDANCE_SERVICE_BASE}/getCourseWiseAttendance?sessionId=${encodeURIComponent(sessionId)}`
  const res = await httpRequest({
    method: 'POST',
    url,
    headers: buildAuthHeaders(session, url),
    body: '{}',
    step: 'fetching attendance totals from ESPRO',
  })
  return assertEsproResponse(res, 'attendance totals')
}

// CONFIRMED 2026-07-31 via real captures: unlike getCourseWiseAttendance,
// these two take sessionId in the JSON body (as a number), not the query
// string, and are bare (no ?sessionId= suffix).
async function fetchPerDayAttendanceCount(session: EsproSession | string, sessionId: string): Promise<unknown> {
  const url = `${ATTENDANCE_SERVICE_BASE}/getPerDayAttendanceCount`
  const res = await httpRequest({
    method: 'POST',
    url,
    headers: buildAuthHeaders(session, url),
    // Empty startDate/endDate returns every day of the session in one call
    // (confirmed against a real ~34-row response spanning June-July) rather
    // than requiring one request per day.
    body: JSON.stringify({ sessionId: Number(sessionId), startDate: '', endDate: '', filterType: 'ALL' }),
    step: 'fetching day-wise attendance from ESPRO',
  })
  return assertEsproResponse(res, 'day-wise attendance')
}

async function fetchPerDayAttendanceDetails(session: EsproSession | string, sessionId: string, date: string): Promise<unknown> {
  const url = `${ATTENDANCE_SERVICE_BASE}/getPerDayAttendanceDetails`
  const res = await httpRequest({
    method: 'POST',
    url,
    headers: buildAuthHeaders(session, url),
    // Unlike getPerDayAttendanceCount, a real (non-empty) startDate here
    // returns only that one day's periods — confirmed empty response rows
    // carry no date field at all, so multi-day ranges aren't distinguishable
    // even if the server accepted one.
    body: JSON.stringify({ sessionId: Number(sessionId), startDate: `${date}T00:00:00`, endDate: '', filterType: 'ALL' }),
    step: `fetching period detail for ${date} from ESPRO`,
  })
  return assertEsproResponse(res, 'per-day detail')
}

// How many mismatched dates to fetch period-level detail for per compare
// run. Bounds the extra request count against a real production server to a
// handful of drill-downs rather than one request per day of the semester —
// there are usually only a few real mismatches, and the day-by-day table
// above already shows every date either way.
const MAX_PERIOD_DRILLDOWNS = 8

export interface EsproComparisonResult {
  subjects: AttendanceComparisonRow[]
  days: DayComparisonRow[]
  /** Period-level detail for the (bounded) mismatched dates in `days`. */
  periodDetails: DayPeriodDetail[]
}

/**
 * Logs into ESPRO, fetches its official per-subject attendance totals plus
 * a day-by-day present/absent breakdown, and compares both against
 * BunkMate's own locally-computed numbers for `semesterLabel`. For any date
 * whose day-level counts don't match, also fetches and returns ESPRO's
 * period-by-period detail for that date (bounded by MAX_PERIOD_DRILLDOWNS)
 * alongside BunkMate's own periods for the same date, so the user can see
 * exactly where the two sides diverge. Throws (rejects) — the caller
 * surfaces the message as a toast — when no credential/session id is
 * stored, login fails (see EsproLoginError in login.ts), or an endpoint
 * doesn't respond as expected.
 */
export async function resolveOrDiscoverEsproSessionId(
  userDataDir: string,
  session: EsproSession | string,
): Promise<string> {
  const existing = readEsproSessionId(userDataDir)
  if (existing) return existing

  for (let candidate = 25; candidate >= 1; candidate--) {
    try {
      const candidateStr = String(candidate)
      const courseJson = await fetchCourseWiseAttendance(session, candidateStr)
      const courses = parseCourseWiseAttendance(courseJson)
      if (courses && courses.length > 0) {
        saveEsproSessionId(userDataDir, candidateStr)
        return candidateStr
      }
    } catch {
      // try next candidate
    }
  }

  const fallback = '1'
  saveEsproSessionId(userDataDir, fallback)
  return fallback
}

export async function esproCompareAttendance(
  db: AppDatabase,
  userDataDir: string,
  semesterLabel: string,
): Promise<EsproComparisonResult> {
  const creds = loadEsproCredential(userDataDir)
  if (!creds) throw new Error('No ESPRO credential is stored yet. Add one in Settings first.')

  const session = await esproLogin(creds)
  const sessionId = await resolveOrDiscoverEsproSessionId(userDataDir, session)

  const totalsJson = await fetchCourseWiseAttendance(session, sessionId)
  const esproTotals = parseCourseWiseAttendance(totalsJson)

  const dayCountJson = await fetchPerDayAttendanceCount(session, sessionId)
  const esproDays = parsePerDayAttendanceCount(dayCountJson)

  const semester = semestersRepo.listSemesters(db).find((s) => s.label === semesterLabel)
  const subjects = subjectsRepo.listSubjects(db, { semester: semesterLabel })
  const slots = timetableSlotsRepo.listTimetableSlots(db, { semester: semesterLabel })
  const holidays = holidaysRepo.listHolidays(db)
  const yellowForms = yellowFormsRepo.listYellowForms(db)
  const rules = periodTypeRulesRepo.listPeriodTypeRules(db)

  const subjectIds = new Set(subjects.map((s) => s.id))
  const records = attendanceRecordsRepo.listAttendanceRecords(db).filter((r) => subjectIds.has(r.subjectId))
  const subjectsById = new Map(subjects.map((s) => [s.id, s]))

  const bySubject = computeAttendance({ records, slots, holidays, yellowForms, rules })

  const localTotals: LocalSubjectTotal[] = subjects.map((s) => {
    const stats = bySubject.get(s.id)
    return {
      subjectName: s.name,
      attended: stats?.overall.attended ?? 0,
      total: stats?.overall.total ?? 0,
      percentage: stats?.overall.percentage ?? null,
    }
  })

  // A 1pp tolerance absorbs float rounding without hiding a real discrepancy
  // (ESPRO's own percentages are already rounded to 2dp).
  const subjectComparison = compareAttendanceTotals({ esproTotals, localTotals, toleranceP: 1 })

  // Raw present/absent tally per date, straight from what the user actually
  // marked — same "trust check" philosophy as the totals comparison, not
  // run back through the bucket-rule engine.
  const localDayCounts = new Map<string, { present: number; absent: number }>()
  for (const r of records) {
    const day = localDayCounts.get(r.date) ?? { present: 0, absent: 0 }
    if (r.status === 'present') day.present++
    else day.absent++
    localDayCounts.set(r.date, day)
  }
  const localDays: LocalDayCount[] = [...localDayCounts.entries()].map(([date, c]) => ({ date, ...c }))

  const days = compareDayAttendance({ esproDays, localDays })

  const mismatchedDates = days.filter((d) => d.status === 'mismatch').map((d) => d.date).slice(0, MAX_PERIOD_DRILLDOWNS)

  const periodDetails: DayPeriodDetail[] = []
  for (const date of mismatchedDates) {
    const detailJson = await fetchPerDayAttendanceDetails(session, sessionId, date)
    const espro = parsePerDayAttendanceDetails(detailJson)
    periodDetails.push({ date, espro, local: buildLocalPeriodRecords(records, subjectsById, semester, date) })
  }

  return { subjects: subjectComparison, days, periodDetails }
}

function buildLocalPeriodRecords(
  records: { subjectId: number; date: string; period: number; status: 'present' | 'absent' }[],
  subjectsById: Map<number, { name: string }>,
  semester: { periodTimes: { period: number; startTime: string; endTime: string }[] | null } | undefined,
  date: string,
): LocalPeriodRecord[] {
  return records
    .filter((r) => r.date === date)
    .map((r) => {
      const pt = semester?.periodTimes?.find((p) => p.period === r.period)
      return {
        subjectName: subjectsById.get(r.subjectId)?.name ?? 'Unknown subject',
        period: r.period,
        startTime: pt?.startTime ?? null,
        endTime: pt?.endTime ?? null,
        status: r.status,
      }
    })
    .sort((a, b) => a.period - b.period)
}

/**
 * Period-level ESPRO-vs-local detail for exactly one date, fetched on
 * demand — the caller (the day comparison table) calls this when the user
 * actually clicks a specific day, rather than every day of the semester
 * being pre-fetched up front (which, at 60-90+ days a semester, would mean
 * that many extra requests against a real production server just in case
 * someone looks). esproCompareAttendance still pre-fetches the first few
 * mismatched dates as a convenience so the most-likely-interesting ones
 * need no extra click, but everything else — including already-matching
 * days — is available through this one-date-at-a-time path.
 */
export async function esproGetDayPeriodDetail(
  db: AppDatabase,
  userDataDir: string,
  semesterLabel: string,
  date: string,
): Promise<DayPeriodDetail> {
  const creds = loadEsproCredential(userDataDir)
  if (!creds) throw new Error('No ESPRO credential is stored yet. Add one in Settings first.')

  const semester = semestersRepo.listSemesters(db).find((s) => s.label === semesterLabel)
  const subjects = subjectsRepo.listSubjects(db, { semester: semesterLabel })
  const subjectIds = new Set(subjects.map((s) => s.id))
  const subjectsById = new Map(subjects.map((s) => [s.id, s]))
  const records = attendanceRecordsRepo
    .listAttendanceRecords(db, { dateFrom: date, dateTo: date })
    .filter((r) => subjectIds.has(r.subjectId))

  const session = await esproLogin(creds)
  const sessionId = await resolveOrDiscoverEsproSessionId(userDataDir, session)
  const detailJson = await fetchPerDayAttendanceDetails(session, sessionId, date)
  const espro = parsePerDayAttendanceDetails(detailJson)

  return { date, espro, local: buildLocalPeriodRecords(records, subjectsById, semester, date) }
}

export interface EsproSyncResult {
  created: number
  updated: number
  unchanged: number
  /** Dates ESPRO had period data for that couldn't be confidently matched to a local subject/period. */
  unmatchedDates: string[]
  /** True when this semester has no allocated period times, so sync couldn't run at all — see Timetable > Grid Settings. */
  missingPeriodTimes: boolean
  /** True when sync couldn't reach ESPRO online and served the existing local SQLite cached records instead. */
  offlineCached?: boolean
}

/**
 * The actual sync (unlike esproCompareAttendance above, this writes real
 * attendance records): logs into ESPRO, fetches its day-wise present/absent
 * counts, and for any date that doesn't already match BunkMate's own
 * records — either the counts disagree, or BunkMate has nothing recorded
 * for a date ESPRO does — fetches that date me period-level detail and
 * writes it locally with source 'espro'. A date ESPRO has no data for yet
 * (e.g. today's classes) is left untouched for manual marking, same as
 * before. Requires this semester's period times to be allocated (Timetable
 * > Grid Settings > Auto-allocate times) — without them there's no honest
 * way to turn an ESPRO clock time into a BunkMate period number.
 */
export async function esproSyncAttendance(
  db: AppDatabase,
  userDataDir: string,
  semesterLabel: string,
): Promise<EsproSyncResult> {
  const creds = loadEsproCredential(userDataDir)
  if (!creds) throw new Error('No ESPRO credential is stored yet. Add one in Settings first.')

  const existingSemesters = semestersRepo.listSemesters(db)
  let semester = semesterLabel
    ? existingSemesters.find((s) => s.label === semesterLabel)
    : existingSemesters.find((s) => s.isActive) || existingSemesters[0]

  if (!semester && !semesterLabel) {
    const todayIso = new Date().toISOString().slice(0, 10)
    const fourMonthsLaterIso = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
    semester = semestersRepo.createSemester(db, {
      number: 1,
      label: 'Semester 1',
      startDate: todayIso,
      endDate: fourMonthsLaterIso,
      isActive: true,
    })
  }
  if (!semester) throw new Error(`No semester found for "${semesterLabel}".`)
  if (!semester.periodTimes || semester.periodTimes.length === 0) {
    return { created: 0, updated: 0, unchanged: 0, unmatchedDates: [], missingPeriodTimes: true }
  }
  const periodTimes = semester.periodTimes

  let session
  let sessionId
  try {
    session = await esproLogin(creds)
    sessionId = await resolveOrDiscoverEsproSessionId(userDataDir, session)
  } catch (err) {
    const isNetworkError =
      err instanceof EsproLoginError
        ? err.failure === 'unreachable'
        : err instanceof Error && /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|fetch|network|offline/i.test(err.message)
    const localRecordsCount = attendanceRecordsRepo.listAttendanceRecords(db).length
    if (isNetworkError && localRecordsCount > 0) {
      return {
        created: 0,
        updated: 0,
        unchanged: localRecordsCount,
        unmatchedDates: [],
        missingPeriodTimes: false,
        offlineCached: true,
      }
    }
    throw err
  }

  const dayCountJson = await fetchPerDayAttendanceCount(session, sessionId)
  const esproDays = parsePerDayAttendanceCount(dayCountJson)

  const subjects = subjectsRepo.listSubjects(db, { semester: semesterLabel })
  const localSubjects: LocalSubjectRef[] = subjects.map((s) => ({ id: s.id, name: s.name }))
  const subjectIds = new Set(subjects.map((s) => s.id))
  const records = attendanceRecordsRepo.listAttendanceRecords(db).filter((r) => subjectIds.has(r.subjectId))

  const localDayCounts = new Map<string, { present: number; absent: number }>()
  for (const r of records) {
    const day = localDayCounts.get(r.date) ?? { present: 0, absent: 0 }
    if (r.status === 'present') day.present++
    else day.absent++
    localDayCounts.set(r.date, day)
  }
  const localDays: LocalDayCount[] = [...localDayCounts.entries()].map(([date, c]) => ({ date, ...c }))

  const days = compareDayAttendance({ esproDays, localDays })
  // 'match' needs no write; 'local-only' has nothing from ESPRO to sync.
  const datesToSync = days.filter((d) => d.status === 'mismatch' || d.status === 'espro-only').map((d) => d.date)

  let created = 0
  let updated = 0
  let unchanged = 0
  const unmatchedDates: string[] = []

  for (const date of datesToSync) {
    const detailJson = await fetchPerDayAttendanceDetails(session, sessionId, date)
    const esproPeriods = parsePerDayAttendanceDetails(detailJson)

    const existingByPeriod = new Map<string, 'present' | 'absent'>()
    for (const r of records) {
      if (r.date === date) existingByPeriod.set(`${r.subjectId}:${r.period}`, r.status)
    }

    const { entries, unmatched } = planEsproSyncForDate({ date, esproPeriods, localSubjects, periodTimes, existingByPeriod })
    if (unmatched.length > 0) unmatchedDates.push(date)

    for (const entry of entries) {
      if (entry.action === 'unchanged') {
        unchanged++
        continue
      }
      attendanceRecordsRepo.createAttendanceRecord(db, {
        subjectId: entry.subjectId,
        date: entry.date,
        period: entry.period,
        status: entry.status,
        source: 'espro',
        slotId: null,
      })
      if (entry.action === 'create') created++
      else updated++
    }

    const existingYellowForms = yellowFormsRepo.listYellowForms(db)
    for (const p of esproPeriods) {
      const isDutyLeave = p.isCocurricular || p.isMedical || (!!p.attendanceType && /duty|co-curricular|excused|yellow|leave|\bod\b/i.test(p.attendanceType))
      if (!isDutyLeave) continue
      const subject = matchEsproCourseToLocalSubject(p.courseCode, p.courseName, localSubjects)
      const period = periodNumberForTime(periodTimes, p.periodStartTime)
      if (!subject || period === undefined) continue

      const exists = existingYellowForms.some((yf) => yf.subjectId === subject.id && yf.date === date && (yf.period === period || yf.period === null))
      if (!exists) {
        const createdForm = yellowFormsRepo.createYellowForm(db, {
          subjectId: subject.id,
          date,
          period,
          reason: p.attendanceType || (p.isMedical ? 'Medical Leave (ESPRO)' : 'Co-curricular / Duty Leave (ESPRO)'),
        })
        yellowFormsRepo.setYellowFormStatus(db, createdForm.id, 'approved')
      }
    }
  }

  return { created, updated, unchanged, unmatchedDates, missingPeriodTimes: false }
}

export interface EsproAutoImportResult extends EsproSyncResult {
  subjectsCreated: number
}

/**
 * 1-Click Full ESPRO Scraper: Auto-discovers subjects from ESPRO, creates any missing
 * subjects locally under semesterLabel, allocates default period times if missing,
 * and imports all historical attendance records.
 */
export async function esproAutoImportFullStudentData(
  db: AppDatabase,
  userDataDir: string,
  semesterLabel: string,
): Promise<EsproAutoImportResult> {
  const creds = loadEsproCredential(userDataDir)
  if (!creds) throw new Error('No ESPRO credential is stored yet. Add your register number and password in Settings.')

  const existingSemesters = semestersRepo.listSemesters(db)
  let semester = existingSemesters.find((s) => s.label === semesterLabel)

  if (!semester) {
    let activeSem = existingSemesters.find((s) => s.isActive) || existingSemesters[0]
    if (!activeSem) {
      const todayIso = new Date().toISOString().slice(0, 10)
      const fourMonthsLaterIso = new Date(Date.now() + 120 * 86400000).toISOString().slice(0, 10)
      activeSem = semestersRepo.createSemester(db, {
        number: 1,
        label: 'Semester 1',
        startDate: todayIso,
        endDate: fourMonthsLaterIso,
        isActive: true,
      })
    } else if (!activeSem.isActive) {
      activeSem = semestersRepo.updateSemester(db, activeSem.id, { isActive: true })
    }
    semester = activeSem
  }
  const targetSemesterLabel = semester.label

  let session
  let sessionId
  try {
    session = await esproLogin(creds)
    sessionId = await resolveOrDiscoverEsproSessionId(userDataDir, session)
  } catch (err) {
    const isNetworkError =
      err instanceof EsproLoginError
        ? err.failure === 'unreachable'
        : err instanceof Error && /ENOTFOUND|ETIMEDOUT|ECONNREFUSED|fetch|network|offline/i.test(err.message)
    const localRecordsCount = attendanceRecordsRepo.listAttendanceRecords(db).length
    if (isNetworkError && localRecordsCount > 0) {
      return {
        created: 0,
        updated: 0,
        unchanged: localRecordsCount,
        unmatchedDates: [],
        missingPeriodTimes: false,
        subjectsCreated: 0,
        offlineCached: true,
      }
    }
    throw err
  }

  // 1. Fetch official course totals to discover all courses on ESPRO
  const courseJson = await fetchCourseWiseAttendance(session, sessionId)
  const esproCourses = parseCourseWiseAttendance(courseJson)

  // 2. Auto-create any missing subjects (including archived subjects to respect unselected electives)
  const localSubjects = subjectsRepo.listSubjects(db, { semester: targetSemesterLabel, includeArchived: true })
  let subjectsCreated = 0
  for (const esproCourse of esproCourses) {
    const codeLower = esproCourse.courseCode?.toLowerCase()
    const nameLower = esproCourse.courseName.toLowerCase()
    const exists = localSubjects.some((s) => {
      const sNameLower = s.name.toLowerCase()
      if (codeLower && sNameLower.includes(codeLower)) return true
      if (sNameLower === nameLower) return true
      return sNameLower.includes(nameLower) || nameLower.includes(sNameLower)
    })
    if (!exists) {
      const subjectName = esproCourse.courseCode ? `${esproCourse.courseName} (${esproCourse.courseCode})` : esproCourse.courseName
      const isElective = /elective|elec|open|discipline/i.test(esproCourse.courseName) || /elective|elec|open|discipline/i.test(esproCourse.courseCode ?? '')
      subjectsRepo.createSubject(db, {
        name: subjectName,
        semester: targetSemesterLabel,
        credits: 3,
        faculty: null,
        category: isElective ? 'elective' : 'core',
      })
      subjectsCreated++
    }
  }

  // 3. Auto-allocate period clock times if missing
  if (!semester.periodTimes || semester.periodTimes.length === 0) {
    const periodTimes = allocateEvenPeriodTimes({
      periodsPerDay: semester.periodsPerDay ?? 7,
      dayStartTime: '09:00',
      dayEndTime: '16:00',
    })
    semestersRepo.updateSemester(db, semester.id, { periodTimes })
  }

  // 4. Perform full sync
  const syncResult = await esproSyncAttendance(db, userDataDir, targetSemesterLabel)

  return {
    ...syncResult,
    subjectsCreated,
  }
}
