import { describe, it, expect } from 'vitest'
import { planDragDrop, type DragSlot } from './timetable-drag'

function slot(id: number, day: DragSlot['day'], period: number, type: DragSlot['type'], subjectId: number | null = null): DragSlot {
  return { id, day, period, type, subjectId }
}

describe('planDragDrop', () => {
  it('moves a period to an empty slot on a different day', () => {
    const slots = [slot(1, 'mon', 1, 'class', 10)]
    const result = planDragDrop({
      slots,
      from: { day: 'mon', period: 1 },
      to: { day: 'tue', period: 3 },
      maxTeachingPeriods: 6,
    })
    expect(result).toEqual({
      ok: true,
      updates: [{ id: 1, day: 'tue', period: 3, startTime: null, endTime: null }],
    })
  })

  it('moves a period to an empty slot on the same day', () => {
    const slots = [slot(1, 'mon', 1, 'class', 10), slot(2, 'mon', 2, 'lunch')]
    const result = planDragDrop({
      slots,
      from: { day: 'mon', period: 1 },
      to: { day: 'mon', period: 5 },
      maxTeachingPeriods: 6,
    })
    expect(result).toEqual({ ok: true, updates: [{ id: 1, day: 'mon', period: 5, startTime: null, endTime: null }] })
  })

  it('rejects a move that would push the target day over the teaching cap', () => {
    // Monday already has 6 classes (at cap 6); dragging Tuesday's class onto
    // an empty Monday period 7 would make 7.
    const slots = [
      slot(1, 'mon', 1, 'class'), slot(2, 'mon', 2, 'class'), slot(3, 'mon', 3, 'class'),
      slot(4, 'mon', 4, 'class'), slot(5, 'mon', 5, 'class'), slot(6, 'mon', 6, 'class'),
      slot(7, 'tue', 1, 'class'),
    ]
    const result = planDragDrop({
      slots,
      from: { day: 'tue', period: 1 },
      to: { day: 'mon', period: 7 },
      maxTeachingPeriods: 6,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at most 6 teaching periods/)
  })

  it('allows a same-day move that keeps the day\'s teaching count unchanged (just relocates within it)', () => {
    const slots = [slot(1, 'mon', 1, 'class'), slot(2, 'mon', 4, 'lunch')]
    const result = planDragDrop({
      slots,
      from: { day: 'mon', period: 1 },
      to: { day: 'mon', period: 2 },
      maxTeachingPeriods: 1,
    })
    // Moving within the same day never changes that day's period count, so
    // a cap that was already satisfied stays satisfied.
    expect(result.ok).toBe(true)
  })

  it('swaps two occupied periods on the same day, content only — day/period stay put', () => {
    const slots = [slot(1, 'mon', 1, 'class', 10), slot(2, 'mon', 2, 'lunch')]
    const result = planDragDrop({
      slots,
      from: { day: 'mon', period: 1 },
      to: { day: 'mon', period: 2 },
      maxTeachingPeriods: 6,
    })
    expect(result).toEqual({
      ok: true,
      updates: [
        { id: 1, subjectId: null, type: 'lunch', startTime: null, endTime: null },
        { id: 2, subjectId: 10, type: 'class', startTime: null, endTime: null },
      ],
    })
  })

  it('swaps two occupied periods across different days', () => {
    const slots = [slot(1, 'mon', 1, 'class', 10), slot(2, 'wed', 3, 'mentoring', 20)]
    const result = planDragDrop({
      slots,
      from: { day: 'mon', period: 1 },
      to: { day: 'wed', period: 3 },
      maxTeachingPeriods: 6,
    })
    expect(result).toEqual({
      ok: true,
      updates: [
        { id: 1, subjectId: 20, type: 'mentoring', startTime: null, endTime: null },
        { id: 2, subjectId: 10, type: 'class', startTime: null, endTime: null },
      ],
    })
  })

  it('rejects a cross-day swap that would create two lunches on the receiving day', () => {
    const slots = [slot(1, 'mon', 1, 'class'), slot(2, 'mon', 4, 'lunch')]
    // Swapping mon:1 (class) with a lunch dropped in from elsewhere would
    // leave mon:4 still lunch AND mon:1 now lunch too.
    const withIncoming = [...slots, slot(3, 'tue', 1, 'lunch')]
    const result = planDragDrop({
      slots: withIncoming,
      from: { day: 'tue', period: 1 },
      to: { day: 'mon', period: 1 },
      maxTeachingPeriods: 6,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at most one lunch/)
  })

  it('rejects a cross-day swap that would push either day over the teaching cap, and applies no updates', () => {
    // Monday: 6 classes (at cap). Tuesday: 1 lunch. Swapping Monday's
    // period-1 class with Tuesday's lunch would make Tuesday gain a class
    // (fine) but that's not the violation here — instead swap a Monday
    // class with a Wednesday class so Wednesday would also hit 7.
    const monday = Array.from({ length: 6 }, (_, i) => slot(i + 1, 'mon', i + 1, 'class'))
    const wednesday = [
      ...Array.from({ length: 6 }, (_, i) => slot(i + 10, 'wed', i + 1, 'class')),
      slot(20, 'wed', 7, 'lunch'),
    ]
    const result = planDragDrop({
      slots: [...monday, ...wednesday],
      from: { day: 'mon', period: 1 },
      to: { day: 'wed', period: 7 },
      maxTeachingPeriods: 6,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toMatch(/at most 6 teaching periods/)
  })

  it('reports "nothing to move" when the dragged slot no longer exists', () => {
    const result = planDragDrop({
      slots: [],
      from: { day: 'mon', period: 1 },
      to: { day: 'mon', period: 2 },
      maxTeachingPeriods: 6,
    })
    expect(result).toEqual({ ok: false, reason: 'Nothing to move.' })
  })
})
