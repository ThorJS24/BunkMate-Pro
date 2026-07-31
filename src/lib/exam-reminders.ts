// Pure "which exam reminders are due right now" calculation, mirroring
// class-reminders.ts so the main-process scheduler stays a thin loop and the
// timing rules are testable without waiting on real clocks.
//
// Exams get two heads-ups rather than a lead window like classes: one the
// evening before (when you'd actually pack/revise) and one on the morning of.
// They're low-frequency and high-stakes, so two is help rather than noise.

export interface ExamReminderInput {
  id: number
  name: string
  courseCode: string | null
  /** ISO yyyy-mm-dd. */
  date: string
  /** "HH:MM" or null when unknown. */
  startTime: string | null
  reportingTime: string | null
  location: string | null
}

export interface DueExamReminder {
  /** Stable per exam+kind so the caller can fire each exactly once. */
  key: string
  kind: 'evening-before' | 'morning-of'
  title: string
  body: string
}

/** Default hours the two reminders fire at (24h). */
export const EVENING_BEFORE_HOUR = 18
export const MORNING_OF_HOUR = 7

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function parseMinutes(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/** "MA231: Mathematics II" / "Mathematics II" when there's no code. */
function label(exam: ExamReminderInput): string {
  return exam.courseCode ? `${exam.courseCode}: ${exam.name}` : exam.name
}

/** "09:30 · Room K224 (report 09:15)" — omits whatever's missing. */
function detail(exam: ExamReminderInput): string {
  const bits: string[] = []
  if (exam.startTime) bits.push(exam.startTime)
  if (exam.location) bits.push(exam.location)
  const head = bits.join(' · ')
  if (exam.reportingTime) return head ? `${head} (report ${exam.reportingTime})` : `Report by ${exam.reportingTime}`
  return head
}

/**
 * Reminders due at this instant. The caller fires each key at most once (it
 * tracks what it has sent). "Due" is deliberately >= the trigger hour rather
 * than an exact match so a reminder isn't lost when the app is opened later
 * in the evening — the once-only key stops it repeating.
 *
 * The morning-of reminder is suppressed once the exam's start time has passed,
 * so launching the app mid-exam doesn't announce it.
 */
export function computeDueExamReminders(params: {
  exams: ExamReminderInput[]
  todayIso: string
  nowMinutes: number
  eveningHour?: number
  morningHour?: number
}): DueExamReminder[] {
  const {
    exams,
    todayIso,
    nowMinutes,
    eveningHour = EVENING_BEFORE_HOUR,
    morningHour = MORNING_OF_HOUR,
  } = params
  const tomorrow = addDays(todayIso, 1)
  const due: DueExamReminder[] = []

  for (const exam of exams) {
    const info = detail(exam)

    if (exam.date === tomorrow && nowMinutes >= eveningHour * 60) {
      due.push({
        key: `exam:${exam.id}:evening-before`,
        kind: 'evening-before',
        title: `Exam tomorrow: ${label(exam)}`,
        body: info || 'Check the time and venue on your hall ticket.',
      })
    }

    if (exam.date === todayIso && nowMinutes >= morningHour * 60) {
      const start = exam.startTime ? parseMinutes(exam.startTime) : null
      if (start === null || nowMinutes < start) {
        due.push({
          key: `exam:${exam.id}:morning-of`,
          kind: 'morning-of',
          title: `Exam today: ${label(exam)}`,
          body: info || 'Check the time and venue on your hall ticket.',
        })
      }
    }
  }
  return due
}
