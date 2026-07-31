// Pure iCalendar (.ics) builder for exams. Unlike the timetable (weekly
// recurring VEVENTs), each exam is a single dated event carrying its venue and
// a reminder alarm, so importing this into a phone calendar gives you the
// sitting with the room and a day-before nudge.
// (Kept self-contained, matching timetable-ics.ts's style, rather than
// refactoring shared helpers out of that already-tested module.)

export interface IcsExam {
  id: number
  name: string
  courseCode: string | null
  /** ISO yyyy-mm-dd. */
  date: string
  /** "HH:MM" or null — a timeless exam becomes an all-day event. */
  startTime: string | null
  reportingTime: string | null
  location: string | null
  examGroup: string | null
}

// Exam length isn't printed on the hall ticket (only start/reporting times),
// so timed events get a conventional 3-hour block. It's a display duration
// only — nothing computes against it.
const ASSUMED_DURATION_MINUTES = 180

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

function stamp(dateIso: string, time: string): string {
  return `${dateIso.replace(/-/g, '')}T${time.replace(':', '')}00`
}

function addDays(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/**
 * Builds the .ics document. Floating local times (no TZID/Z) so an exam lands
 * at its printed clock time in whatever calendar imports it. Exams without a
 * start time become all-day events rather than being dropped — the date is the
 * part you most need. Returns a valid empty document when given no exams.
 */
export function buildExamsIcs(params: { exams: IcsExam[]; semesterLabel: string }): string {
  const { exams, semesterLabel } = params
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BunkMate Pro//Exams//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(`Exams ${semesterLabel}`)}`,
  ]

  for (const exam of [...exams].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))) {
    const summary = exam.courseCode ? `${exam.courseCode}: ${exam.name}` : exam.name
    const descParts: string[] = []
    if (exam.examGroup) descParts.push(exam.examGroup)
    if (exam.reportingTime) descParts.push(`Report by ${exam.reportingTime}`)
    descParts.push(`Semester ${semesterLabel}`)

    lines.push('BEGIN:VEVENT')
    lines.push(`UID:exam-${exam.id}-${exam.date.replace(/-/g, '')}@bunkmate.pro`)
    if (exam.startTime) {
      lines.push(`DTSTART:${stamp(exam.date, exam.startTime)}`)
      lines.push(`DTEND:${stamp(exam.date, addMinutes(exam.startTime, ASSUMED_DURATION_MINUTES))}`)
    } else {
      // All-day: DTEND is exclusive, so it's the following day.
      lines.push(`DTSTART;VALUE=DATE:${exam.date.replace(/-/g, '')}`)
      lines.push(`DTEND;VALUE=DATE:${addDays(exam.date, 1).replace(/-/g, '')}`)
    }
    lines.push(`SUMMARY:${escapeText(summary)}`)
    if (exam.location) lines.push(`LOCATION:${escapeText(exam.location)}`)
    lines.push(`DESCRIPTION:${escapeText(descParts.join(' · '))}`)
    // A day-before alarm, matching the app's own evening-before reminder.
    lines.push('BEGIN:VALARM')
    lines.push('ACTION:DISPLAY')
    lines.push('TRIGGER:-P1D')
    lines.push(`DESCRIPTION:${escapeText(`Tomorrow: ${summary}`)}`)
    lines.push('END:VALARM')
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}
