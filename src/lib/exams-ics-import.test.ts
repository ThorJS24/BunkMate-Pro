import { describe, it, expect } from 'vitest'
import { icsEventsToExamDrafts } from './exams-ics-import'
import type { ParsedIcsEvent } from './ics-parser'

function event(overrides: Partial<ParsedIcsEvent> = {}): ParsedIcsEvent {
  return {
    uid: null,
    summary: 'Mid Semester',
    description: null,
    location: null,
    date: '2026-03-10',
    startTime: null,
    endTime: null,
    byDay: [],
    ...overrides,
  }
}

describe('icsEventsToExamDrafts', () => {
  it('splits a "CODE: Name" summary into courseCode and name', () => {
    const [row] = icsEventsToExamDrafts([event({ summary: 'MA231: Mid Semester' })], [])
    expect(row.courseCode).toBe('MA231')
    expect(row.name).toBe('Mid Semester')
  })

  it('also accepts the older "CODE — Name" separator, for files exported before the format changed', () => {
    const [row] = icsEventsToExamDrafts([event({ summary: 'MA231 — Mid Semester' })], [])
    expect(row.courseCode).toBe('MA231')
    expect(row.name).toBe('Mid Semester')
  })

  it('keeps the whole summary as the name when there is no code prefix', () => {
    const [row] = icsEventsToExamDrafts([event({ summary: 'Project Viva' })], [])
    expect(row.courseCode).toBe('')
    expect(row.name).toBe('Project Viva')
  })

  it('matches a subject by exact case-insensitive name', () => {
    const rows = icsEventsToExamDrafts([event({ summary: 'data structures' })], [{ id: 5, name: 'Data Structures' }])
    expect(rows[0].subjectId).toBe(5)
  })

  it('leaves subjectId null when nothing matches', () => {
    const rows = icsEventsToExamDrafts([event({ summary: 'Something else' })], [{ id: 5, name: 'Data Structures' }])
    expect(rows[0].subjectId).toBeNull()
  })

  it('carries date, startTime, and location through', () => {
    const [row] = icsEventsToExamDrafts(
      [event({ date: '2026-03-10', startTime: '09:00', location: 'Block II Room K224' })],
      [],
    )
    expect(row.date).toBe('2026-03-10')
    expect(row.startTime).toBe('09:00')
    expect(row.location).toBe('Block II Room K224')
  })
})
