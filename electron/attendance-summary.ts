import type { AppDatabase } from './db/client'
import {
  settingsRepo,
  subjectsRepo,
  attendanceRecordsRepo,
  timetableSlotsRepo,
  holidaysRepo,
  yellowFormsRepo,
  periodTypeRulesRepo,
} from './db/repositories'
import { computeAttendance, aggregateOverall } from '../src/lib/attendance-engine'
import { scopeRecordsToSubjects } from '../src/lib/semester-scope'

/**
 * Overall attendance % for the active semester, computed in the main process
 * for the tray. Deliberately reuses the SAME engine primitives
 * (computeAttendance + aggregateOverall) and semester scoping the renderer
 * uses — not a re-implementation. It intentionally runs over logged records
 * only (no auto-present synthesis): the tray is a lightweight glance, and
 * auto-present is a renderer-time refinement that would mean duplicating the
 * day-attendance timing logic here.
 */
export function computeOverallSummary(db: AppDatabase): {
  percentage: number | null
  attended: number
  total: number
} {
  const settings = settingsRepo.getSettings(db)
  const semester = settings.currentSemester
  if (!semester) return { percentage: null, attended: 0, total: 0 }

  const subjectIds = subjectsRepo
    .listSubjects(db, { semester, includeArchived: true })
    .map((s) => s.id)
  const records = scopeRecordsToSubjects(attendanceRecordsRepo.listAttendanceRecords(db), subjectIds)
  const slots = timetableSlotsRepo.listTimetableSlots(db, { semester })
  const holidays = holidaysRepo.listHolidays(db)
  const yellowForms = yellowFormsRepo.listYellowForms(db)
  const rules = periodTypeRulesRepo.listPeriodTypeRules(db)

  const overall = aggregateOverall(computeAttendance({ records, slots, holidays, yellowForms, rules }))
  return { percentage: overall.percentage, attended: overall.attended, total: overall.total }
}
