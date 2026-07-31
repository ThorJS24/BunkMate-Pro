// Maps parsed .ics events (an institution's academic calendar export) into
// candidate holiday rows for review before saving. Pure so the mapping is
// testable without a running app — the review/apply step lives in the
// Holidays page, same split as attendance-import.ts's parse+reconcile.
import type { HolidayType } from '@/db/schema'
import type { ParsedIcsEvent } from './ics-parser'

export interface HolidayDraftRow {
  key: string
  date: string
  label: string
  type: HolidayType
  /** True when a holiday already exists on this date (dates are unique). */
  alreadyExists: boolean
}

/**
 * One draft row per distinct date (an .ics may list a multi-day break as
 * several same-summary events across consecutive dates — each date still
 * gets its own row, since holidays are stored one-per-date). Events that
 * share a date keep only the first summary seen.
 */
export function icsEventsToHolidayDrafts(events: ParsedIcsEvent[], existingDates: Set<string>): HolidayDraftRow[] {
  const seen = new Map<string, ParsedIcsEvent>()
  for (const event of events) {
    if (!seen.has(event.date)) seen.set(event.date, event)
  }
  return [...seen.values()]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((event) => ({
      key: event.date,
      date: event.date,
      label: event.summary || 'Holiday',
      type: 'custom' as HolidayType,
      alreadyExists: existingDates.has(event.date),
    }))
}
