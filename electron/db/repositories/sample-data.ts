import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { semesters, subjects, timetableSlots, attendanceRecords, settings, SETTINGS_SINGLETON_ID, WEEKDAYS, type Weekday } from '../../../src/db/schema'
import type { Semester } from './semesters'

// A fixed, believable demo timetable — five subjects across a 6-period day
// with lunch on period 4, Mon-Fri. Not randomized: reproducible sample data
// is easier to reason about (in support conversations, screenshots, etc.)
// than a different demo every time.
const SAMPLE_SUBJECTS = [
  { name: 'Data Structures & Algorithms', credits: 4, category: 'Core', color: '#2a78d6' },
  { name: 'Discrete Mathematics', credits: 3, category: 'Core', color: '#e87ba4' },
  { name: 'Digital Electronics', credits: 3, category: 'Core', color: '#eda100' },
  { name: 'Environmental Studies', credits: 2, category: 'General', color: '#1baf7a' },
  { name: 'Communication Skills', credits: 2, category: 'General', color: '#eb6834' },
]

const PERIODS_PER_DAY = 6
const LUNCH_PERIOD = 4

/**
 * Seeds a believable semester with subjects, a Mon-Fri timetable, and two
 * weeks of attendance history, so someone can explore the app (Dashboard,
 * Attendance, Analytics, GPA) before typing in a single real class. Runs in
 * one transaction — a half-seeded demo semester would be more confusing
 * than no demo at all. `label` is unique per call so it's safe to press
 * "Try sample data" more than once without a constraint error.
 */
export function createSampleData(db: AppDatabase): Semester {
  const existingLabels = new Set(db.select({ label: semesters.label }).from(semesters).all().map((s) => s.label))
  let label = 'Demo Semester'
  let n = 2
  while (existingLabels.has(label)) {
    label = `Demo Semester ${n}`
    n++
  }

  const today = new Date()
  const startDate = new Date(today)
  startDate.setDate(startDate.getDate() - 21)
  const endDate = new Date(today)
  endDate.setDate(endDate.getDate() + 90)
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  return db.transaction((tx) => {
    tx.update(semesters).set({ isActive: false }).run()

    const sem = tx
      .insert(semesters)
      .values({
        number: 1,
        label,
        startDate: iso(startDate),
        endDate: iso(endDate),
        isActive: true,
        periodsPerDay: PERIODS_PER_DAY,
        lunchPeriod: LUNCH_PERIOD,
      })
      .returning()
      .get()

    const subjectIds = SAMPLE_SUBJECTS.map((s) =>
      tx
        .insert(subjects)
        .values({ name: s.name, semester: sem.label, credits: s.credits, category: s.category, color: s.color })
        .returning()
        .get().id,
    )

    // Mon-Fri only (sat left free, matching a typical timetable), cycling
    // subjects across periods so every subject appears a few times a week.
    const teachingDays: Weekday[] = WEEKDAYS.filter((d) => d !== 'sat')
    const slotBySubjectSequence = new Map<string, number>()
    for (const day of teachingDays) {
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        if (period === LUNCH_PERIOD) {
          tx.insert(timetableSlots).values({ semester: sem.label, day, period, type: 'lunch' }).run()
          continue
        }
        const subjectIndex = (teachingDays.indexOf(day) + period) % subjectIds.length
        const slot = tx
          .insert(timetableSlots)
          .values({ semester: sem.label, day, period, type: 'class', subjectId: subjectIds[subjectIndex] })
          .returning()
          .get()
        slotBySubjectSequence.set(`${day}:${period}`, slot.id)
      }
    }

    // Two weeks of history immediately before today, present by default with
    // a handful of absences sprinkled in so the attendance %, "at risk"
    // states, and analytics charts all have something real to show.
    const dayKeyForDate = (d: Date): Weekday => WEEKDAYS[(d.getDay() + 6) % 7]
    let dayCounter = 0
    for (let offset = 14; offset >= 1; offset--) {
      const d = new Date(today)
      d.setDate(d.getDate() - offset)
      const weekday = dayKeyForDate(d)
      if (!teachingDays.includes(weekday)) continue
      dayCounter++
      for (let period = 1; period <= PERIODS_PER_DAY; period++) {
        if (period === LUNCH_PERIOD) continue
        const subjectIndex = (teachingDays.indexOf(weekday) + period) % subjectIds.length
        const subjectId = subjectIds[subjectIndex]
        const slotId = slotBySubjectSequence.get(`${weekday}:${period}`) ?? null
        // Roughly one absence every ~9 periods — enough to make percentages
        // and "at risk" coloring feel real without tanking every subject.
        const status = (dayCounter * PERIODS_PER_DAY + period) % 9 === 0 ? 'absent' : 'present'
        tx.insert(attendanceRecords)
          .values({ subjectId, date: iso(d), period, status, source: 'manual', slotId })
          .run()
      }
    }

    // Inlined rather than reusing ensureSettingsRow(): its AppDatabase param
    // type doesn't structurally match a transaction handle (missing
    // $client), so it can't be called with `tx` here.
    const existingSettings = tx.select().from(settings).where(eq(settings.id, SETTINGS_SINGLETON_ID)).get()
    if (existingSettings) {
      tx.update(settings).set({ currentSemester: sem.label }).where(eq(settings.id, SETTINGS_SINGLETON_ID)).run()
    } else {
      tx.insert(settings).values({ id: SETTINGS_SINGLETON_ID, currentSemester: sem.label }).run()
    }

    return sem
  })
}
