import { describe, it, expect } from 'vitest'
import { planTimetableCopy, type CopySourceSlot } from './timetable-copy'

function src(day: CopySourceSlot['day'], period: number, type: CopySourceSlot['type'], subjectId: number | null): CopySourceSlot {
  return { day, period, type, subjectId, startTime: null, endTime: null }
}

describe('planTimetableCopy', () => {
  it('remaps subjects by name into the target semester', () => {
    const plan = planTimetableCopy({
      sourceSlots: [src('mon', 1, 'class', 10)],
      sourceSubjectNames: new Map([[10, 'Data Structures']]),
      targetSubjectIdsByName: new Map([['Data Structures', 99]]),
      occupiedTargetCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate).toEqual([
      { day: 'mon', period: 1, type: 'class', subjectId: 99, startTime: null, endTime: null },
    ])
    expect(plan.unmatchedSubjects).toEqual([])
  })

  it('copies structure only (subject null) and reports the name when unmatched', () => {
    const plan = planTimetableCopy({
      sourceSlots: [src('mon', 1, 'class', 10)],
      sourceSubjectNames: new Map([[10, 'Quantum Computing']]),
      targetSubjectIdsByName: new Map(),
      occupiedTargetCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate[0].subjectId).toBeNull()
    expect(plan.unmatchedSubjects).toEqual(['Quantum Computing'])
  })

  it('skips cells already occupied in the target (non-destructive)', () => {
    const plan = planTimetableCopy({
      sourceSlots: [src('mon', 1, 'class', 10), src('mon', 2, 'class', 10)],
      sourceSubjectNames: new Map([[10, 'DS']]),
      targetSubjectIdsByName: new Map([['DS', 10]]),
      occupiedTargetCells: new Set(['mon:1']),
      maxPeriod: 7,
    })
    expect(plan.toCreate.map((s) => s.period)).toEqual([2])
    expect(plan.skipped).toBe(1)
  })

  it('skips source slots beyond the target period range', () => {
    const plan = planTimetableCopy({
      sourceSlots: [src('mon', 8, 'class', 10)],
      sourceSubjectNames: new Map([[10, 'DS']]),
      targetSubjectIdsByName: new Map([['DS', 10]]),
      occupiedTargetCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate).toEqual([])
    expect(plan.skipped).toBe(1)
  })

  it('carries lunch/subjectless slots through without a subject or an unmatched report', () => {
    const plan = planTimetableCopy({
      sourceSlots: [src('mon', 4, 'lunch', null)],
      sourceSubjectNames: new Map(),
      targetSubjectIdsByName: new Map(),
      occupiedTargetCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate).toEqual([
      { day: 'mon', period: 4, type: 'lunch', subjectId: null, startTime: null, endTime: null },
    ])
    expect(plan.unmatchedSubjects).toEqual([])
  })

  it('preserves per-slot times', () => {
    const plan = planTimetableCopy({
      sourceSlots: [{ day: 'tue', period: 2, type: 'class', subjectId: 10, startTime: '09:00', endTime: '10:00' }],
      sourceSubjectNames: new Map([[10, 'DS']]),
      targetSubjectIdsByName: new Map([['DS', 5]]),
      occupiedTargetCells: new Set(),
      maxPeriod: 7,
    })
    expect(plan.toCreate[0]).toMatchObject({ subjectId: 5, startTime: '09:00', endTime: '10:00' })
  })
})
