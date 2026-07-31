// Plans importing a weekly timetable from a recurring .ics — either this
// app's own export (round-tripped) or another BunkMate user's, which is what
// makes sharing a class's schedule (e.g. a whole section importing one
// person's exported timetable) possible without a per-class template system.
//
// Period numbers don't exist in iCalendar, only clock times, so each day's
// events are numbered by chronological start-time order — the same
// convention allocateEvenPeriodTimes() and the Grid use elsewhere. Only
// events with a weekly BYDAY recurrence are considered; one-off dated events
// aren't timetable material. Non-destructive like planTimetableCopy: a
// cell that's already occupied is skipped, never overwritten.
import { WEEKDAYS, type Weekday } from '@/db/schema'
import type { ParsedIcsEvent } from './ics-parser'

export interface IcsTimetableDraftSlot {
  day: Weekday
  period: number
  subjectName: string
  startTime: string
  endTime: string
}

export interface IcsTimetableImportPlan {
  toCreate: IcsTimetableDraftSlot[]
  /** Distinct subject names referenced by toCreate, in first-seen order. */
  subjectNames: string[]
  /** Recurring events that would land beyond maxPeriod or on an occupied cell. */
  skipped: number
}

export function planIcsTimetableImport(params: {
  events: ParsedIcsEvent[]
  /** "day:period" keys already occupied in the target semester. */
  occupiedCells: Set<string>
  maxPeriod: number
}): IcsTimetableImportPlan {
  const { events, occupiedCells, maxPeriod } = params
  const toCreate: IcsTimetableDraftSlot[] = []
  const subjectNames: string[] = []
  const seenSubjectNames = new Set<string>()
  let skipped = 0

  for (const day of WEEKDAYS) {
    const forDay = events
      .filter((e) => e.byDay.includes(day) && e.startTime !== null)
      .map((e) => ({ ...e, startTime: e.startTime as string }))
      .sort((a, b) => a.startTime.localeCompare(b.startTime))

    forDay.forEach((event, i) => {
      const period = i + 1
      if (period > maxPeriod || occupiedCells.has(`${day}:${period}`)) {
        skipped++
        return
      }
      const subjectName = event.summary.trim() || 'Class'
      if (!seenSubjectNames.has(subjectName.toLowerCase())) {
        seenSubjectNames.add(subjectName.toLowerCase())
        subjectNames.push(subjectName)
      }
      toCreate.push({
        day,
        period,
        subjectName,
        startTime: event.startTime,
        endTime: event.endTime ?? event.startTime,
      })
    })
  }

  return { toCreate, subjectNames, skipped }
}
