// Pure planner for "copy timetable from another semester". The subtlety is
// that a source slot's subjectId belongs to the SOURCE semester's subjects,
// which are different rows from the target semester's — so subjects are
// re-matched by name, and anything unmatched is copied as structure only
// (subject left null) rather than pointing at the wrong semester's subject.
import type { Weekday, PeriodType } from '@/db/schema'

export interface CopySourceSlot {
  day: Weekday
  period: number
  type: PeriodType
  subjectId: number | null
  startTime: string | null
  endTime: string | null
}

export interface CopyPlanSlot {
  day: Weekday
  period: number
  type: PeriodType
  subjectId: number | null
  startTime: string | null
  endTime: string | null
}

export interface TimetableCopyPlan {
  toCreate: CopyPlanSlot[]
  /** Occupied-cell or out-of-range source slots that were left alone. */
  skipped: number
  /** Distinct source subject names with no same-named subject in the target
   * semester — copied as structure only (subject null), surfaced so the user
   * knows what to reassign. */
  unmatchedSubjects: string[]
}

/**
 * Plans a non-destructive copy: only fills target cells that are currently
 * empty (never clobbers existing work) and only within the target's period
 * range. Subject ids are remapped by name; unmatched subjects become
 * subject-less structure.
 */
export function planTimetableCopy(params: {
  sourceSlots: CopySourceSlot[]
  /** id → name for the source semester's subjects. */
  sourceSubjectNames: Map<number, string>
  /** name → id for the target semester's subjects. */
  targetSubjectIdsByName: Map<string, number>
  /** "day:period" keys already occupied in the target. */
  occupiedTargetCells: Set<string>
  /** Target semester's periodsPerDay — source slots beyond it are skipped. */
  maxPeriod: number
}): TimetableCopyPlan {
  const { sourceSlots, sourceSubjectNames, targetSubjectIdsByName, occupiedTargetCells, maxPeriod } = params
  const toCreate: CopyPlanSlot[] = []
  const unmatched = new Set<string>()
  let skipped = 0

  for (const slot of sourceSlots) {
    if (slot.period > maxPeriod || occupiedTargetCells.has(`${slot.day}:${slot.period}`)) {
      skipped++
      continue
    }

    let subjectId: number | null = null
    if (slot.subjectId !== null) {
      const name = sourceSubjectNames.get(slot.subjectId)
      const matchedId = name ? targetSubjectIdsByName.get(name) : undefined
      if (matchedId !== undefined) subjectId = matchedId
      else if (name) unmatched.add(name)
    }

    toCreate.push({
      day: slot.day,
      period: slot.period,
      type: slot.type,
      subjectId,
      startTime: slot.startTime,
      endTime: slot.endTime,
    })
  }

  return { toCreate, skipped, unmatchedSubjects: [...unmatched] }
}
