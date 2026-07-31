// Pure planning logic for dragging a period on the Timetable grid onto
// another slot. Kept out of the component (and unit-tested directly)
// because the move-vs-swap / same-day-vs-cross-day branching below is
// exactly the kind of thing that's easy to get subtly wrong and hard to
// exercise reliably by driving a live drag gesture.
import type { Weekday, PeriodType } from '@/db/schema'
import { validateTimetableDay } from './timetable-rules'

export interface DragSlot {
  id: number
  day: Weekday
  period: number
  type: PeriodType
  subjectId: number | null
}

export interface SlotUpdate {
  id: number
  day?: Weekday
  period?: number
  subjectId?: number | null
  type?: PeriodType
  startTime?: string | null
  endTime?: string | null
}

export type PlanDragDropResult = { ok: true; updates: SlotUpdate[] } | { ok: false; reason: string }

export interface PlanDragDropParams {
  slots: DragSlot[]
  from: { day: Weekday; period: number }
  to: { day: Weekday; period: number }
  maxTeachingPeriods: number
}

function hypotheticalDaySlots(
  slots: DragSlot[],
  day: Weekday,
  opts: { removePeriod?: number; setPeriods?: Map<number, string> },
): { period: number; type: string }[] {
  const byPeriod = new Map<number, string>()
  for (const s of slots) {
    if (s.day !== day || s.period === opts.removePeriod) continue
    byPeriod.set(s.period, s.type)
  }
  for (const [period, type] of opts.setPeriods ?? []) byPeriod.set(period, type)
  return Array.from(byPeriod, ([period, type]) => ({ period, type }))
}

/**
 * Decides what dragging `from` onto `to` should do and whether it's allowed:
 *
 * - Dropping on an EMPTY slot MOVES the dragged period there (day/period
 *   change on that one row; its old spot is freed). Only the target day's
 *   resulting composition needs validating — removing a period from the
 *   source day can never create a new cap/lunch violation there.
 * - Dropping on an OCCUPIED slot SWAPS the two periods' content
 *   (subjectId/type) — day/period never change on either row, which is
 *   what makes a swap safe to apply as two independent updates without a
 *   transient (semester, day, period) collision. Both days' resulting
 *   compositions are validated before either update is returned; a
 *   rejected swap returns no updates at all rather than half-applying.
 *
 * Neither path touches periodTimes: those are keyed by period number only,
 * so whatever lands on a period automatically shows that period's already-
 * allocated time. Any legacy per-slot startTime/endTime IS cleared on both
 * paths — that field describes a specific slot's manual time, which is
 * meaningless once the content has moved to a different period.
 *
 * Callers are expected to have already short-circuited a same-cell drop
 * (from equals to) and a missing dragged slot — this function assumes both
 * are real.
 */
export function planDragDrop(params: PlanDragDropParams): PlanDragDropResult {
  const { slots, from, to, maxTeachingPeriods } = params
  const bySlotKey = new Map(slots.map((s) => [`${s.day}:${s.period}`, s]))
  const draggedSlot = bySlotKey.get(`${from.day}:${from.period}`)
  if (!draggedSlot) return { ok: false, reason: 'Nothing to move.' }
  const targetSlot = bySlotKey.get(`${to.day}:${to.period}`)

  if (!targetSlot) {
    const validation = validateTimetableDay(
      hypotheticalDaySlots(slots, to.day, {
        removePeriod: to.day === from.day ? from.period : undefined,
        setPeriods: new Map([[to.period, draggedSlot.type]]),
      }),
      { maxTeachingPeriods },
    )
    if (!validation.ok) return { ok: false, reason: validation.errors[0] }
    return {
      ok: true,
      updates: [{ id: draggedSlot.id, day: to.day, period: to.period, startTime: null, endTime: null }],
    }
  }

  if (from.day === to.day) {
    const validation = validateTimetableDay(
      hypotheticalDaySlots(slots, from.day, {
        setPeriods: new Map([
          [from.period, targetSlot.type],
          [to.period, draggedSlot.type],
        ]),
      }),
      { maxTeachingPeriods },
    )
    if (!validation.ok) return { ok: false, reason: validation.errors[0] }
  } else {
    const sourceValidation = validateTimetableDay(
      hypotheticalDaySlots(slots, from.day, { setPeriods: new Map([[from.period, targetSlot.type]]) }),
      { maxTeachingPeriods },
    )
    const targetValidation = validateTimetableDay(
      hypotheticalDaySlots(slots, to.day, { setPeriods: new Map([[to.period, draggedSlot.type]]) }),
      { maxTeachingPeriods },
    )
    const failed = !sourceValidation.ok ? sourceValidation : !targetValidation.ok ? targetValidation : null
    if (failed) return { ok: false, reason: failed.errors[0] }
  }

  return {
    ok: true,
    updates: [
      { id: draggedSlot.id, subjectId: targetSlot.subjectId, type: targetSlot.type, startTime: null, endTime: null },
      { id: targetSlot.id, subjectId: draggedSlot.subjectId, type: draggedSlot.type, startTime: null, endTime: null },
    ],
  }
}
