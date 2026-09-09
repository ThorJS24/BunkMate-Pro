import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import {
  semesters,
  subjects,
  timetableSlots,
  attendanceRecords,
  holidays,
  exams,
  leavePlans,
  yellowForms,
  yellowFormDisputes,
  settings,
  SETTINGS_SINGLETON_ID,
} from '../../../src/db/schema'

/**
 * The "start completely fresh" button: wipes every table of tracked
 * academic data (semesters, subjects, timetable, attendance, exams,
 * holidays, leave plans, yellow forms) in one transaction. Deliberately
 * leaves two things untouched: `settings` itself (theme, density, backup
 * config, ESPRO credential/session — those are how the app is configured,
 * not data to track, and ESPRO removal already has its own explicit
 * control), and `periodTypeRules` (institution config, not user data,
 * re-seeded fresh by ensureDefaultPeriodTypeRules on next launch regardless).
 * `currentSemester` is reset to '' since whatever it pointed at is gone.
 */
export function clearAllData(db: AppDatabase): void {
  db.transaction((tx) => {
    tx.delete(yellowFormDisputes).run()
    tx.delete(yellowForms).run()
    tx.delete(attendanceRecords).run()
    tx.delete(exams).run()
    tx.delete(timetableSlots).run()
    tx.delete(subjects).run()
    tx.delete(leavePlans).run()
    tx.delete(holidays).run()
    tx.delete(semesters).run()
    tx.update(settings).set({ currentSemester: '' }).where(eq(settings.id, SETTINGS_SINGLETON_ID)).run()
  })
}
