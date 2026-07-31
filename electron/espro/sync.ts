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
  attendanceRecordsRepo,
  timetableSlotsRepo,
  holidaysRepo,
  yellowFormsRepo,
  periodTypeRulesRepo,
} from '../db/repositories'
import { computeAttendance } from '../../src/lib/attendance-engine'
import { loadEsproCredential, readEsproSessionId } from './credential-store'
import { esproLogin, httpRequest } from './login'
import {
  parseCourseWiseAttendance,
  compareAttendanceTotals,
  type AttendanceComparisonRow,
  type LocalSubjectTotal,
} from './attendance-totals'

// CONFIRMED 2026-07-29 via a real captured request (URL + method, from
// DevTools' Headers panel — a live login/session run, not an inference).
// Third origin, separate from the SPA (:444) and Keycloak (:8010).
const ATTENDANCE_SERVICE_BASE =
  'https://espro.christuniversity.in:84/Protected/ClassRoomAttendanceServices/Student/StudentAttendance'

async function fetchCourseWiseAttendance(accessToken: string, sessionId: string): Promise<unknown> {
  const res = await httpRequest({
    method: 'POST',
    url: `${ATTENDANCE_SERVICE_BASE}/getCourseWiseAttendance?sessionId=${encodeURIComponent(sessionId)}`,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: '{}',
    step: 'fetching attendance totals from ESPRO',
  })
  if (res.status !== 200) {
    throw new Error(`ESPRO's attendance endpoint returned HTTP ${res.status}.`)
  }
  try {
    return JSON.parse(res.body)
  } catch {
    throw new Error("ESPRO's attendance response wasn't valid JSON.")
  }
}

/**
 * Logs into ESPRO, fetches its official per-subject attendance totals, and
 * compares them against BunkMate's own locally-computed totals for
 * `semesterLabel`. Throws (rejects) — the caller surfaces the message as a
 * toast — when no credential/session id is stored, login fails (see
 * EsproLoginError in login.ts), or the totals endpoint doesn't respond as
 * expected.
 */
export async function esproCompareAttendance(
  db: AppDatabase,
  userDataDir: string,
  semesterLabel: string,
): Promise<AttendanceComparisonRow[]> {
  const creds = loadEsproCredential(userDataDir)
  if (!creds) throw new Error('No ESPRO credential is stored yet. Add one in Settings first.')

  const sessionId = readEsproSessionId(userDataDir)
  if (!sessionId) throw new Error('No ESPRO session/term number is set yet. Add one in Settings first.')

  const session = await esproLogin(creds)
  const json = await fetchCourseWiseAttendance(session.accessToken, sessionId)
  const esproTotals = parseCourseWiseAttendance(json)

  const subjects = subjectsRepo.listSubjects(db, { semester: semesterLabel })
  const slots = timetableSlotsRepo.listTimetableSlots(db, { semester: semesterLabel })
  const holidays = holidaysRepo.listHolidays(db)
  const yellowForms = yellowFormsRepo.listYellowForms(db)
  const rules = periodTypeRulesRepo.listPeriodTypeRules(db)

  const subjectIds = new Set(subjects.map((s) => s.id))
  const records = attendanceRecordsRepo.listAttendanceRecords(db).filter((r) => subjectIds.has(r.subjectId))

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
  return compareAttendanceTotals({ esproTotals, localTotals, toleranceP: 1 })
}
