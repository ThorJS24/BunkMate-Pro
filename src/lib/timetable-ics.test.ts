import { describe, it, expect } from 'vitest'
import { buildTimetableIcs, type IcsSlot } from './timetable-ics'

function slot(day: IcsSlot['day'], period: number, type: string, subjectName: string | null, startTime: string | null, endTime: string | null): IcsSlot {
  return { day, period, type, subjectName, startTime, endTime }
}

const base = { semesterLabel: '2026-1', startDate: '2026-01-01', endDate: '2026-05-31' }
// 2026-01-01 is a Thursday; first Monday on/after is 2026-01-05.

describe('buildTimetableIcs', () => {
  it('wraps events in a valid VCALENDAR', () => {
    const ics = buildTimetableIcs({ ...base, slots: [] })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).toContain('VERSION:2.0')
    expect(ics).toContain('END:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })

  it('emits one recurring weekly event per slot with UNTIL at the semester end', () => {
    const ics = buildTimetableIcs({ ...base, slots: [slot('mon', 1, 'class', 'Data Structures', '09:00', '10:00')] })
    expect(ics).toContain('BEGIN:VEVENT')
    expect(ics).toContain('SUMMARY:Data Structures')
    // First Monday on/after 2026-01-01 is 2026-01-05.
    expect(ics).toContain('DTSTART:20260105T090000')
    expect(ics).toContain('DTEND:20260105T100000')
    expect(ics).toContain('RRULE:FREQ=WEEKLY;UNTIL=20260531T235959;BYDAY=MO')
    // Exactly one event.
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
  })

  it('maps each weekday to the right BYDAY and first occurrence', () => {
    const ics = buildTimetableIcs({
      ...base,
      slots: [slot('wed', 2, 'class', 'OS', '10:00', '11:00'), slot('sat', 3, 'class', 'Net', '11:00', '12:00')],
    })
    expect(ics).toContain('BYDAY=WE')
    expect(ics).toContain('DTSTART:20260107T100000') // first Wed = 2026-01-07
    expect(ics).toContain('BYDAY=SA')
    expect(ics).toContain('DTSTART:20260103T110000') // first Sat = 2026-01-03
  })

  it('skips lunch and any slot without a start time', () => {
    const ics = buildTimetableIcs({
      ...base,
      slots: [
        slot('mon', 4, 'lunch', null, '12:00', '13:00'),
        slot('mon', 1, 'class', 'DS', null, null),
        slot('tue', 2, 'class', 'OS', '10:00', '11:00'),
      ],
    })
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1)
    expect(ics).toContain('SUMMARY:OS')
    expect(ics).not.toContain('lunch')
  })

  it('defaults DTEND to start + 1h when no end time', () => {
    const ics = buildTimetableIcs({ ...base, slots: [slot('mon', 1, 'class', 'DS', '09:00', null)] })
    expect(ics).toContain('DTEND:20260105T100000')
  })

  it('uses the type as summary for subjectless periods and escapes commas', () => {
    const ics = buildTimetableIcs({ ...base, slots: [slot('mon', 1, 'class', 'Math, Applied', '09:00', '10:00')] })
    expect(ics).toContain('SUMMARY:Math\\, Applied')
  })
})
