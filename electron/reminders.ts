import { Notification, BrowserWindow } from 'electron'
import type { AppDatabase } from './db/client'
import { settingsRepo, semestersRepo, timetableSlotsRepo, subjectsRepo, examsRepo } from './db/repositories'
import { jsDayToWeekday } from '../src/lib/attendance-engine'
import { computeDueReminders } from '../src/lib/class-reminders'
import { computeDueExamReminders } from '../src/lib/exam-reminders'
import { todayIso } from '../src/lib/date-utils'

// How often the scheduler re-checks. 30s means a reminder fires within half a
// minute of its lead window opening — fine granularity for a ~10-minute
// heads-up, cheap enough to run continuously.
const TICK_MS = 30_000

function nowMinutes(): number {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Starts the class-start reminder loop in the MAIN process. It only fires
 * while the app is running — this is not a background OS service; if the app
 * is closed, no reminders are sent (surfaced to the user in Settings).
 *
 * Each tick: if reminders are enabled and today's active semester has period
 * times, ask computeDueReminders() what's in its lead window right now, and
 * fire a native Notification for any not already sent today. The fired-key
 * set resets when the date rolls over.
 */
export function startClassReminders(db: AppDatabase): () => void {
  const firedToday = new Set<string>()
  let firedDate = todayIso()

  /** Fires a native notification once per key, per day. */
  function fireOnce(key: string, title: string, body: string) {
    if (firedToday.has(key)) return
    firedToday.add(key)
    if (!Notification.isSupported()) return
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      const win = BrowserWindow.getAllWindows()[0]
      if (win) {
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    })
    notification.show()
  }

  // Exams are reminded independently of the class-reminder settings and of
  // whether the timetable has clock times — they're separate commitments.
  function tickExams(today: string) {
    const settings = settingsRepo.getSettings(db)
    if (!settings.examReminders) return
    const exams = examsRepo.listExams(db, { semester: settings.currentSemester })
    if (exams.length === 0) return

    const due = computeDueExamReminders({
      exams: exams.map((e) => ({
        id: e.id,
        name: e.name,
        courseCode: e.courseCode,
        date: e.date,
        startTime: e.startTime,
        reportingTime: e.reportingTime,
        location: e.location,
      })),
      todayIso: today,
      nowMinutes: nowMinutes(),
    })
    for (const reminder of due) fireOnce(reminder.key, reminder.title, reminder.body)
  }

  function tick() {
    try {
      const today = todayIso()
      if (today !== firedDate) {
        firedToday.clear()
        firedDate = today
      }

      // Never let an exam-reminder failure stop class reminders, or vice versa.
      try {
        tickExams(today)
      } catch {
        // swallow; retry next tick
      }

      const settings = settingsRepo.getSettings(db)
      if (!settings.classReminders) return

      const semester = semestersRepo
        .listSemesters(db)
        .find((s) => s.label === settings.currentSemester)
      const periodTimes = semester?.periodTimes ?? []
      if (periodTimes.length === 0) return // no clock times -> nothing to remind against

      const weekday = jsDayToWeekday(today)
      if (!weekday) return

      const slots = timetableSlotsRepo
        .listTimetableSlots(db, { semester: settings.currentSemester })
        .filter((s) => s.day === weekday)
      if (slots.length === 0) return

      const subjectsById = new Map(
        subjectsRepo.listSubjects(db, { includeArchived: true }).map((s) => [s.id, s.name]),
      )

      const due = computeDueReminders({
        slots: slots.map((s) => ({
          period: s.period,
          type: s.type,
          subjectName: s.subjectId !== null ? (subjectsById.get(s.subjectId) ?? null) : null,
        })),
        periodTimes,
        nowMinutes: nowMinutes(),
        leadMinutes: settings.classReminderLeadMinutes,
      })

      for (const reminder of due) {
        fireOnce(`${today}:${reminder.period}`, reminder.title, reminder.body)
      }
    } catch {
      // A reminder failure must never take down the app — swallow and retry
      // next tick.
    }
  }

  const interval = setInterval(tick, TICK_MS)
  tick() // check once immediately on start
  return () => clearInterval(interval)
}
