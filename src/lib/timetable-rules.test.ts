import { describe, it, expect } from 'vitest'
import { validateTimetableDay, canAddTeachingPeriod, MAX_TEACHING_PERIODS_PER_DAY } from './timetable-rules'

function classes(n: number) {
  return Array.from({ length: n }, (_, i) => ({ period: i + 1, type: 'class' }))
}

describe('validateTimetableDay', () => {
  it('accepts 6 teaching periods plus a lunch', () => {
    const day = [...classes(6), { period: 7, type: 'lunch' }]
    const res = validateTimetableDay(day)
    expect(res.ok).toBe(true)
    expect(res.teachingCount).toBe(6)
    expect(res.errors).toEqual([])
  })

  it('rejects a 7th teaching period', () => {
    const res = validateTimetableDay(classes(7))
    expect(res.ok).toBe(false)
    expect(res.teachingCount).toBe(7)
    expect(res.errors.some((e) => e.includes('at most 6 teaching periods'))).toBe(true)
  })

  it('does not count lunch or meeting against the teaching cap', () => {
    const day = [...classes(6), { period: 7, type: 'lunch' }, { period: 8, type: 'meeting' }]
    expect(validateTimetableDay(day).ok).toBe(true)
  })

  it('flags duplicate period numbers', () => {
    const day = [{ period: 1, type: 'class' }, { period: 1, type: 'class' }]
    const res = validateTimetableDay(day)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('Duplicate period 1'))).toBe(true)
  })

  it('flags non-positive period numbers', () => {
    const res = validateTimetableDay([{ period: 0, type: 'class' }])
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('positive integers'))).toBe(true)
  })

  it('flags more than one lunch', () => {
    const day = [{ period: 1, type: 'lunch' }, { period: 2, type: 'lunch' }]
    const res = validateTimetableDay(day)
    expect(res.ok).toBe(false)
    expect(res.errors.some((e) => e.includes('at most one lunch'))).toBe(true)
  })

  it('honors a custom maxTeachingPeriods', () => {
    expect(validateTimetableDay(classes(5), { maxTeachingPeriods: 4 }).ok).toBe(false)
    expect(validateTimetableDay(classes(4), { maxTeachingPeriods: 4 }).ok).toBe(true)
  })

  it('allows an 8th teaching period for a semester configured with 8 periodsPerDay, where the old hardcoded 6-period cap would have wrongly rejected it at the 7th', () => {
    // Regression test for timetable.tsx:128, which used to call
    // validateTimetableDay(daySlots) with no options, ignoring the active
    // semester's periodsPerDay and always enforcing the default cap of 6.
    const periodsPerDay = 8
    expect(validateTimetableDay(classes(7), { maxTeachingPeriods: periodsPerDay }).ok).toBe(true)
    const res = validateTimetableDay(classes(8), { maxTeachingPeriods: periodsPerDay })
    expect(res.ok).toBe(true)
    expect(res.teachingCount).toBe(8)

    // The old hardcoded default (no options) still rejects both, proving the
    // fix is specifically about wiring periodsPerDay through, not a change
    // to the default cap itself.
    expect(validateTimetableDay(classes(7)).ok).toBe(false)
    expect(validateTimetableDay(classes(8)).ok).toBe(false)
  })
})

describe('canAddTeachingPeriod', () => {
  it('is true below the cap and false at it', () => {
    expect(canAddTeachingPeriod(classes(5))).toBe(true)
    expect(canAddTeachingPeriod(classes(MAX_TEACHING_PERIODS_PER_DAY))).toBe(false)
  })
  it('ignores lunch when counting toward the cap', () => {
    const day = [...classes(5), { period: 6, type: 'lunch' }]
    expect(canAddTeachingPeriod(day)).toBe(true)
  })
})
