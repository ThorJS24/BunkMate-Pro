import { describe, it, expect } from 'vitest'
import { parseIcs } from './ics-parser'
import { buildTimetableIcs } from './timetable-ics'
import { buildExamsIcs } from './exam-ics'

describe('parseIcs', () => {
  it('parses a single dated all-day event', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'BEGIN:VEVENT',
      'UID:holiday-1@example.com',
      'SUMMARY:Independence Day',
      'DTSTART;VALUE=DATE:20260815',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const events = parseIcs(ics)
    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({ summary: 'Independence Day', date: '2026-08-15', startTime: null })
  })

  it('parses a timed event with location and description', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:MA231: Mid Semester',
      'DTSTART:20260310T090000',
      'DTEND:20260310T120000',
      'LOCATION:Block II Room K224',
      'DESCRIPTION:Report by 08:30',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const [event] = parseIcs(ics)
    expect(event.date).toBe('2026-03-10')
    expect(event.startTime).toBe('09:00')
    expect(event.endTime).toBe('12:00')
    expect(event.location).toBe('Block II Room K224')
    expect(event.description).toBe('Report by 08:30')
  })

  it('extracts BYDAY weekdays from a weekly RRULE, dropping SU', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Data Structures',
      'DTSTART:20260105T090000',
      'DTEND:20260105T100000',
      'RRULE:FREQ=WEEKLY;UNTIL=20260531T235959;BYDAY=MO,WE',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const [event] = parseIcs(ics)
    expect(event.byDay).toEqual(['mon', 'wed'])
  })

  it('unfolds RFC 5545 folded lines (continuation starts with a space)', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:A very long summary that a real calendar app would',
      ' fold across two lines',
      'DTSTART;VALUE=DATE:20260101',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const [event] = parseIcs(ics)
    expect(event.summary).toBe('A very long summary that a real calendar app wouldfold across two lines')
  })

  it('unescapes commas, semicolons, and backslash-n in text values', () => {
    const ics = [
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT',
      'SUMMARY:Math\\, Applied',
      'DTSTART;VALUE=DATE:20260101',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n')
    const [event] = parseIcs(ics)
    expect(event.summary).toBe('Math, Applied')
  })

  it('drops events with no DTSTART', () => {
    const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'SUMMARY:No date', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n')
    expect(parseIcs(ics)).toHaveLength(0)
  })

  it('returns an empty list for a calendar with no events', () => {
    expect(parseIcs('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toEqual([])
  })

  it('round-trips buildTimetableIcs output', () => {
    const ics = buildTimetableIcs({
      slots: [{ day: 'mon', period: 1, type: 'class', subjectName: 'Data Structures', startTime: '09:00', endTime: '10:00' }],
      semesterLabel: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-31',
    })
    const [event] = parseIcs(ics)
    expect(event.summary).toBe('Data Structures')
    expect(event.startTime).toBe('09:00')
    expect(event.endTime).toBe('10:00')
    expect(event.byDay).toEqual(['mon'])
  })

  it('round-trips buildExamsIcs output, including an all-day (timeless) exam', () => {
    const ics = buildExamsIcs({
      exams: [
        {
          id: 1,
          name: 'Mid Semester',
          courseCode: 'MA231',
          date: '2026-03-10',
          startTime: '09:00',
          reportingTime: '08:30',
          location: 'Block II Room K224',
          examGroup: 'Mid Semester',
        },
        {
          id: 2,
          name: 'Project Viva',
          courseCode: null,
          date: '2026-04-01',
          startTime: null,
          reportingTime: null,
          location: null,
          examGroup: null,
        },
      ],
      semesterLabel: '2026-1',
    })
    const events = parseIcs(ics)
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ summary: 'MA231: Mid Semester', date: '2026-03-10', startTime: '09:00' })
    expect(events[1]).toMatchObject({ summary: 'Project Viva', date: '2026-04-01', startTime: null })
  })
})
