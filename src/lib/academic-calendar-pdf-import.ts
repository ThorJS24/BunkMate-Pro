import type { HolidayType } from '@/db/schema'
import type { HolidayDraftRow } from './holidays-import'

// Parses a CHRIST-style academic calendar PDF's extracted text (see
// electron/pdf-text.ts) into holiday candidates. Confirmed against a real
// 2026-27 calendar — every holiday cell follows one consistent template
// ("DD (Weekday) Holiday - Label", occasionally with the date and the
// "Holiday - Label" text landing on separate lines when a table row's cells
// aren't vertically aligned), which is the actual thing being matched, not
// document layout. A future year's calendar (different content, "next year
// content may change") should still parse as long as CHRIST keeps that
// template; if they don't, this degrades to finding fewer/zero rows rather
// than misfiring, and the review dialog before import is the safety net
// either way — nothing lands in the DB unreviewed.
export interface ParsedCalendarHoliday {
  date: string
  label: string
  isWorkingSaturday: boolean
}

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
]

const MONTH_HEADER_RE = /^([A-Za-z]+)\s+(\d{4})$/
// "07 ( Wed )" and "07 (Wed)" both seen in the real extraction — spacing
// inside the parens isn't consistent, so it's optional on both sides.
const DATE_ONLY_RE = /^(\d{1,2})\s*\(\s*[A-Za-z]{3}\s*\)\s*$/
const DATE_PREFIX_RE = /^(\d{1,2})\s*\(\s*[A-Za-z]{3}\s*\)\s*(.*)$/
const HOLIDAY_RE = /^Holiday\b\s*[-–:]?\s*\(?(.*)$/i
const WORKING_SATURDAY_RE = /working day for Faculty/i

interface PendingDate {
  day: number
  month: number
  year: number
}

function toIso(d: PendingDate): string {
  return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`
}

function extractFromCellText(text: string, date: PendingDate, out: ParsedCalendarHoliday[]): boolean {
  if (WORKING_SATURDAY_RE.test(text)) {
    out.push({ date: toIso(date), label: 'Working Saturday', isWorkingSaturday: true })
    return true
  }
  const m = HOLIDAY_RE.exec(text)
  if (m) {
    const label = (m[1] ?? '').replace(/\)\s*$/, '').trim()
    out.push({ date: toIso(date), label: label || 'Holiday', isWorkingSaturday: false })
    return true
  }
  return false
}

export function parseAcademicCalendarText(text: string): ParsedCalendarHoliday[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)

  const results: ParsedCalendarHoliday[] = []
  let currentMonth: number | null = null
  let currentYear: number | null = null
  let pendingDate: PendingDate | null = null

  for (const line of lines) {
    const monthMatch = MONTH_HEADER_RE.exec(line)
    if (monthMatch) {
      const idx = MONTHS.indexOf(monthMatch[1].toLowerCase())
      if (idx !== -1) {
        currentMonth = idx + 1
        currentYear = Number(monthMatch[2])
        pendingDate = null
      }
      continue
    }
    if (currentMonth === null || currentYear === null) continue

    const dateOnly = DATE_ONLY_RE.exec(line)
    if (dateOnly) {
      pendingDate = { day: Number(dateOnly[1]), month: currentMonth, year: currentYear }
      continue
    }

    const datePrefix = DATE_PREFIX_RE.exec(line)
    if (datePrefix) {
      const date = { day: Number(datePrefix[1]), month: currentMonth, year: currentYear }
      pendingDate = date
      extractFromCellText(datePrefix[2].trim(), date, results)
      continue
    }

    // No date on this line at all — only meaningful if the previous line was
    // a standalone date marker with its cell text on the next line (the one
    // real case of this: "21 (Wed)" then "Holiday- Vijayadasami").
    if (pendingDate && extractFromCellText(line, pendingDate, results)) {
      pendingDate = null
    }
  }

  const seen = new Set<string>()
  return results.filter((r) => {
    if (seen.has(r.date)) return false
    seen.add(r.date)
    return true
  })
}

/** Same draft shape the .ics import already feeds into the review dialog. */
export function calendarHolidaysToDrafts(
  parsed: ParsedCalendarHoliday[],
  existingDates: Set<string>,
): HolidayDraftRow[] {
  return [...parsed]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((h) => ({
      key: h.date,
      date: h.date,
      label: h.label,
      type: (h.isWorkingSaturday ? 'working_saturday' : 'public') as HolidayType,
      alreadyExists: existingDates.has(h.date),
    }))
}
