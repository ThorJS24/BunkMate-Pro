// Pure iCalendar (.ics) reader — the counterpart to timetable-ics.ts/exam-ics.ts,
// which only ever wrote this format. Deliberately tolerant of files this app
// didn't produce (a university's academic calendar, Google Calendar exports,
// etc.), since that's the whole point of importing: unfolds RFC 5545 folded
// lines, ignores property parameters it doesn't need (TZID, VALUE), and skips
// any VEVENT it can't make sense of rather than throwing.
import type { Weekday } from '@/db/schema'

export interface ParsedIcsEvent {
  uid: string | null
  summary: string
  description: string | null
  location: string | null
  /** ISO yyyy-mm-dd, the event's (first) date. */
  date: string
  /** "HH:MM", or null when the event is all-day/date-only. */
  startTime: string | null
  endTime: string | null
  /** Weekday tokens from RRULE BYDAY, e.g. ['mon']. Empty when not a weekly recurrence. */
  byDay: Weekday[]
}

const BYDAY_TO_WEEKDAY: Record<string, Weekday | undefined> = {
  MO: 'mon',
  TU: 'tue',
  WE: 'wed',
  TH: 'thu',
  FR: 'fri',
  SA: 'sat',
  // SU intentionally excluded — not a timetable day in this app.
}

/** RFC 5545 line unfolding: a line starting with a space/tab continues the previous line. */
function unfoldLines(text: string): string[] {
  const raw = text.split(/\r\n|\n|\r/)
  const out: string[] = []
  for (const line of raw) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length > 0) {
      out[out.length - 1] += line.slice(1)
    } else {
      out.push(line)
    }
  }
  return out
}

/** "KEY;PARAM=X:value" -> { key: "KEY", params: {PARAM: "X"}, value: "value" }. */
function parseProperty(line: string): { key: string; params: Record<string, string>; value: string } | null {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return null
  const head = line.slice(0, colonIdx)
  const value = line.slice(colonIdx + 1)
  const [key, ...paramParts] = head.split(';')
  const params: Record<string, string> = {}
  for (const part of paramParts) {
    const eq = part.indexOf('=')
    if (eq === -1) continue
    params[part.slice(0, eq).toUpperCase()] = part.slice(eq + 1)
  }
  return { key: key.toUpperCase(), params, value }
}

function unescapeText(s: string): string {
  return s.replace(/\\n/gi, '\n').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\')
}

/** "20260605T090000" / "20260605T090000Z" / "20260605" -> { date, time } (time null when date-only). */
function parseDateTimeValue(value: string): { date: string; time: string | null } | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?Z?)?$/.exec(value.trim())
  if (!m) return null
  const [, y, mo, d, h, mi] = m
  const date = `${y}-${mo}-${d}`
  if (h === undefined) return { date, time: null }
  return { date, time: `${h}:${mi}` }
}

function parseByDay(rrule: string): Weekday[] {
  const m = /BYDAY=([A-Z,]+)/.exec(rrule)
  if (!m) return []
  const days: Weekday[] = []
  for (const token of m[1].split(',')) {
    const day = BYDAY_TO_WEEKDAY[token]
    if (day) days.push(day)
  }
  return days
}

/**
 * Parses every VEVENT in an .ics document. Events missing a usable DTSTART
 * are dropped (there's nothing useful to import); everything else is best-effort.
 */
export function parseIcs(text: string): ParsedIcsEvent[] {
  const lines = unfoldLines(text)
  const events: ParsedIcsEvent[] = []

  let inEvent = false
  let current: {
    uid: string | null
    summary: string
    description: string | null
    location: string | null
    dtstart: { date: string; time: string | null } | null
    dtend: { date: string; time: string | null } | null
    byDay: Weekday[]
  } | null = null

  for (const line of lines) {
    const trimmed = line.trim()
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true
      current = { uid: null, summary: '', description: null, location: null, dtstart: null, dtend: null, byDay: [] }
      continue
    }
    if (trimmed === 'END:VEVENT') {
      if (current?.dtstart) {
        events.push({
          uid: current.uid,
          summary: current.summary,
          description: current.description,
          location: current.location,
          date: current.dtstart.date,
          startTime: current.dtstart.time,
          endTime: current.dtend?.time ?? null,
          byDay: current.byDay,
        })
      }
      inEvent = false
      current = null
      continue
    }
    if (!inEvent || !current) continue

    const prop = parseProperty(line)
    if (!prop) continue

    switch (prop.key) {
      case 'UID':
        current.uid = prop.value.trim()
        break
      case 'SUMMARY':
        current.summary = unescapeText(prop.value.trim())
        break
      case 'DESCRIPTION':
        current.description = unescapeText(prop.value.trim()) || null
        break
      case 'LOCATION':
        current.location = unescapeText(prop.value.trim()) || null
        break
      case 'DTSTART':
        current.dtstart = parseDateTimeValue(prop.value)
        break
      case 'DTEND':
        current.dtend = parseDateTimeValue(prop.value)
        break
      case 'RRULE':
        current.byDay = parseByDay(prop.value)
        break
      default:
        break
    }
  }

  return events
}
