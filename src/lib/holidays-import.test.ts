import { describe, it, expect } from 'vitest'
import { icsEventsToHolidayDrafts } from './holidays-import'
import type { ParsedIcsEvent } from './ics-parser'

function event(date: string, summary: string): ParsedIcsEvent {
  return { uid: null, summary, description: null, location: null, date, startTime: null, endTime: null, byDay: [] }
}

describe('icsEventsToHolidayDrafts', () => {
  it('maps events to draft rows sorted by date', () => {
    const rows = icsEventsToHolidayDrafts([event('2026-08-15', 'Independence Day'), event('2026-01-26', 'Republic Day')], new Set())
    expect(rows.map((r) => r.date)).toEqual(['2026-01-26', '2026-08-15'])
    expect(rows[0]).toMatchObject({ label: 'Republic Day', type: 'custom', alreadyExists: false })
  })

  it('flags dates that already have a holiday', () => {
    const rows = icsEventsToHolidayDrafts([event('2026-08-15', 'Independence Day')], new Set(['2026-08-15']))
    expect(rows[0].alreadyExists).toBe(true)
  })

  it('collapses multiple events on the same date into one row', () => {
    const rows = icsEventsToHolidayDrafts([event('2026-08-15', 'Independence Day'), event('2026-08-15', 'Flag Hoisting')], new Set())
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe('Independence Day')
  })

  it('falls back to a generic label when the event has no summary', () => {
    const rows = icsEventsToHolidayDrafts([event('2026-08-15', '')], new Set())
    expect(rows[0].label).toBe('Holiday')
  })
})
