import { describe, it, expect } from 'vitest'
import { buildExamsIcs, type IcsExam } from './exam-ics'

const exam = (over: Partial<IcsExam> = {}): IcsExam => ({
  id: 1,
  name: 'Mathematics II',
  courseCode: 'MA231',
  date: '2026-04-15',
  startTime: '09:30',
  reportingTime: '09:15',
  location: 'BLOCK II Floor:FIRST Room:K224',
  examGroup: 'End Semester',
  ...over,
})

describe('buildExamsIcs', () => {
  it('wraps events in a valid calendar', () => {
    const ics = buildExamsIcs({ exams: [exam()], semesterLabel: '2026-1' })
    expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics).toContain('VERSION:2.0')
    expect(ics.split('\r\n').length).toBeGreaterThan(5) // CRLF line endings
  })

  it('emits a timed event with a 3h block and the venue', () => {
    const ics = buildExamsIcs({ exams: [exam()], semesterLabel: '2026-1' })
    expect(ics).toContain('DTSTART:20260415T093000')
    expect(ics).toContain('DTEND:20260415T123000')
    expect(ics).toContain('SUMMARY:MA231: Mathematics II')
    // ';' and ',' must be escaped per RFC 5545
    expect(ics).toContain('LOCATION:BLOCK II Floor:FIRST Room:K224')
  })

  it('carries the sitting and reporting time in the description', () => {
    const ics = buildExamsIcs({ exams: [exam()], semesterLabel: '2026-1' })
    expect(ics).toContain('DESCRIPTION:End Semester · Report by 09:15 · Semester 2026-1')
  })

  it('adds a day-before alarm', () => {
    const ics = buildExamsIcs({ exams: [exam()], semesterLabel: '2026-1' })
    expect(ics).toContain('BEGIN:VALARM')
    expect(ics).toContain('TRIGGER:-P1D')
  })

  it('falls back to an all-day event when there is no start time', () => {
    const ics = buildExamsIcs({ exams: [exam({ startTime: null })], semesterLabel: '2026-1' })
    expect(ics).toContain('DTSTART;VALUE=DATE:20260415')
    expect(ics).toContain('DTEND;VALUE=DATE:20260416') // exclusive end
    expect(ics).not.toContain('DTSTART:20260415T')
  })

  it('drops the code prefix when there is none', () => {
    const ics = buildExamsIcs({ exams: [exam({ courseCode: null })], semesterLabel: '2026-1' })
    expect(ics).toContain('SUMMARY:Mathematics II')
  })

  it('escapes reserved characters in text fields', () => {
    const ics = buildExamsIcs({
      exams: [exam({ name: 'Maths; Paper A, B', location: 'Room 1, Block 2' })],
      semesterLabel: '2026-1',
    })
    expect(ics).toContain('SUMMARY:MA231: Maths\\; Paper A\\, B')
    expect(ics).toContain('LOCATION:Room 1\\, Block 2')
  })

  it('orders events by date', () => {
    const ics = buildExamsIcs({
      exams: [exam({ id: 2, date: '2026-04-20' }), exam({ id: 1, date: '2026-04-15' })],
      semesterLabel: '2026-1',
    })
    expect(ics.indexOf('20260415')).toBeLessThan(ics.indexOf('20260420'))
  })

  it('returns a valid empty calendar for no exams', () => {
    const ics = buildExamsIcs({ exams: [], semesterLabel: '2026-1' })
    expect(ics).toContain('BEGIN:VCALENDAR')
    expect(ics).not.toContain('BEGIN:VEVENT')
  })
})
