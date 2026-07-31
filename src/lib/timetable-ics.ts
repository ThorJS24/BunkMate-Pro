// Pure iCalendar (.ics) builder for the weekly timetable. One VEVENT per
// slot — i.e. per distinct subject/period/day — as a WEEKLY recurring event
// bounded by the semester's end (RRULE UNTIL), rather than hundreds of
// individual dated events. Kept pure/tested so the string format is verified
// without a running app.
import type { Weekday } from '@/db/schema'

export interface IcsSlot {
  day: Weekday
  period: number
  type: string
  subjectName: string | null
  /** Resolved clock times ("HH:MM"); null start means "no time yet" and the
   * slot is skipped — the caller gates the whole export on times existing. */
  startTime: string | null
  endTime: string | null
}

// Weekday -> RRULE BYDAY token + JS getUTCDay index, for finding the first
// occurrence and the recurrence rule.
const WEEKDAY_META: Record<Weekday, { byday: string; jsDay: number }> = {
  sun: { byday: 'SU', jsDay: 0 }, // not a real timetable day, included for completeness
  mon: { byday: 'MO', jsDay: 1 },
  tue: { byday: 'TU', jsDay: 2 },
  wed: { byday: 'WE', jsDay: 3 },
  thu: { byday: 'TH', jsDay: 4 },
  fri: { byday: 'FR', jsDay: 5 },
  sat: { byday: 'SA', jsDay: 6 },
} as unknown as Record<Weekday, { byday: string; jsDay: number }>

function firstOccurrenceOnOrAfter(startDate: string, jsDay: number): string {
  const d = new Date(`${startDate}T00:00:00Z`)
  for (let i = 0; i < 7; i++) {
    if (d.getUTCDay() === jsDay) return d.toISOString().slice(0, 10)
    d.setUTCDate(d.getUTCDate() + 1)
  }
  return startDate
}

function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = h * 60 + m + minutes
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`
}

/** yyyy-mm-dd + HH:MM -> local floating iCal timestamp YYYYMMDDTHHMMSS. */
function icsDateTime(dateIso: string, time: string): string {
  return `${dateIso.replace(/-/g, '')}T${time.replace(':', '')}00`
}

function escapeText(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

const EXCLUDED_TYPES = new Set(['lunch'])

/**
 * Builds the full .ics document. Floating local times (no TZID/Z) so events
 * land at the shown clock time in whatever calendar imports them — the right
 * default for a class timetable. Skips lunch and any slot without a start
 * time. Returns a document with zero events if nothing qualifies (still valid).
 */
export function buildTimetableIcs(params: {
  slots: IcsSlot[]
  semesterLabel: string
  startDate: string
  endDate: string
}): string {
  const { slots, semesterLabel, startDate, endDate } = params
  const untilStamp = `${endDate.replace(/-/g, '')}T235959`

  const events: string[] = []
  for (const slot of slots) {
    if (EXCLUDED_TYPES.has(slot.type) || !slot.startTime) continue
    const meta = WEEKDAY_META[slot.day]
    const first = firstOccurrenceOnOrAfter(startDate, meta.jsDay)
    const end = slot.endTime ?? addMinutes(slot.startTime, 60)
    const summary = escapeText(slot.subjectName ?? slot.type)

    events.push(
      [
        'BEGIN:VEVENT',
        `UID:${semesterLabel}-${slot.day}-p${slot.period}@bunkmate`,
        `SUMMARY:${summary}`,
        `DTSTART:${icsDateTime(first, slot.startTime)}`,
        `DTEND:${icsDateTime(first, end)}`,
        `RRULE:FREQ=WEEKLY;UNTIL=${untilStamp};BYDAY=${meta.byday}`,
        `DESCRIPTION:${escapeText(`Period ${slot.period} · ${semesterLabel}`)}`,
        'END:VEVENT',
      ].join('\r\n'),
    )
  }

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//BunkMate Pro//Timetable//EN',
    'CALSCALE:GREGORIAN',
    `X-WR-CALNAME:${escapeText(`Timetable ${semesterLabel}`)}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n')
}
