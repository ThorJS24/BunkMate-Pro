import { describe, it, expect } from 'vitest'
import { planIcsTimetableImport } from './timetable-ics-import'
import type { ParsedIcsEvent } from './ics-parser'
import type { Weekday } from '@/db/schema'

function recurringEvent(summary: string, byDay: Weekday[], startTime: string, endTime: string): ParsedIcsEvent {
  return { uid: null, summary, description: null, location: null, date: '2026-01-05', startTime, endTime, byDay }
}

describe('planIcsTimetableImport', () => {
  it('numbers each day\'s events by chronological start time, starting at 1', () => {
    const plan = planIcsTimetableImport({
      events: [
        recurringEvent('OS', ['mon'], '10:00', '11:00'),
        recurringEvent('DS', ['mon'], '09:00', '10:00'),
      ],
      occupiedCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate).toEqual([
      { day: 'mon', period: 1, subjectName: 'DS', startTime: '09:00', endTime: '10:00' },
      { day: 'mon', period: 2, subjectName: 'OS', startTime: '10:00', endTime: '11:00' },
    ])
  })

  it('expands a multi-day BYDAY event into one slot per day', () => {
    const plan = planIcsTimetableImport({
      events: [recurringEvent('DS', ['mon', 'wed'], '09:00', '10:00')],
      occupiedCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate.map((s) => s.day)).toEqual(['mon', 'wed'])
  })

  it('skips a cell that is already occupied', () => {
    const plan = planIcsTimetableImport({
      events: [recurringEvent('DS', ['mon'], '09:00', '10:00')],
      occupiedCells: new Set(['mon:1']),
      maxPeriod: 7,
    })
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.skipped).toBe(1)
  })

  it('skips events that would land beyond maxPeriod', () => {
    const plan = planIcsTimetableImport({
      events: [
        recurringEvent('P1', ['mon'], '09:00', '10:00'),
        recurringEvent('P2', ['mon'], '10:00', '11:00'),
      ],
      occupiedCells: new Set(),
      maxPeriod: 1,
    })
    expect(plan.toCreate).toEqual([{ day: 'mon', period: 1, subjectName: 'P1', startTime: '09:00', endTime: '10:00' }])
    expect(plan.skipped).toBe(1)
  })

  it('ignores non-recurring (one-off, no BYDAY) events', () => {
    const oneOff: ParsedIcsEvent = { uid: null, summary: 'Holiday', description: null, location: null, date: '2026-01-05', startTime: null, endTime: null, byDay: [] }
    const plan = planIcsTimetableImport({ events: [oneOff], occupiedCells: new Set(), maxPeriod: 7 })
    expect(plan.toCreate).toHaveLength(0)
    expect(plan.skipped).toBe(0)
  })

  it('collects distinct subject names in first-seen order', () => {
    const plan = planIcsTimetableImport({
      events: [
        recurringEvent('DS', ['mon'], '09:00', '10:00'),
        recurringEvent('OS', ['tue'], '09:00', '10:00'),
        recurringEvent('ds', ['wed'], '09:00', '10:00'),
      ],
      occupiedCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.subjectNames).toEqual(['DS', 'OS'])
  })
})
