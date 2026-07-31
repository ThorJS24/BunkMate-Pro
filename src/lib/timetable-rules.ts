// Pure timetable structural rules. Kept out of the timetable UI so the same
// constraints can be enforced on create/edit and unit-tested without a DOM.
//
// Institution rule (CHRIST): a day has at most 6 teaching hours, plus a lunch
// break. Lunch and other non-teaching rows (e.g. meetings) don't consume one
// of the 6 teaching slots.

export const MAX_TEACHING_PERIODS_PER_DAY = 6

/** Period types that do NOT count against the 6-teaching-hours cap. */
export const DEFAULT_NON_TEACHING_TYPES = ['lunch', 'meeting'] as const

export interface TimetableDaySlotInput {
  period: number
  type: string
}

export interface TimetableValidationResult {
  ok: boolean
  errors: string[]
  teachingCount: number
}

export interface ValidateOptions {
  maxTeachingPeriods?: number
  nonTeachingTypes?: readonly string[]
  /** at most one lunch row per day (default true). */
  singleLunch?: boolean
}

/**
 * Validates one day's worth of timetable slots. Returns every problem found
 * (not just the first) so a form can surface them together.
 */
export function validateTimetableDay(
  slots: TimetableDaySlotInput[],
  opts: ValidateOptions = {},
): TimetableValidationResult {
  const maxTeaching = opts.maxTeachingPeriods ?? MAX_TEACHING_PERIODS_PER_DAY
  const nonTeaching = new Set(opts.nonTeachingTypes ?? DEFAULT_NON_TEACHING_TYPES)
  const singleLunch = opts.singleLunch ?? true

  const errors: string[] = []

  // Non-positive / duplicate period numbers.
  const seen = new Set<number>()
  for (const s of slots) {
    if (!Number.isInteger(s.period) || s.period < 1) {
      errors.push(`Period numbers must be positive integers (got ${s.period}).`)
    }
    if (seen.has(s.period)) {
      errors.push(`Duplicate period ${s.period} on the same day.`)
    }
    seen.add(s.period)
  }

  const teachingCount = slots.filter((s) => !nonTeaching.has(s.type)).length
  if (teachingCount > maxTeaching) {
    errors.push(`A day can have at most ${maxTeaching} teaching periods (found ${teachingCount}).`)
  }

  if (singleLunch) {
    const lunchCount = slots.filter((s) => s.type === 'lunch').length
    if (lunchCount > 1) {
      errors.push(`A day can have at most one lunch break (found ${lunchCount}).`)
    }
  }

  // de-duplicate identical messages (e.g. two duplicate-period hits)
  const unique = [...new Set(errors)]
  return { ok: unique.length === 0, errors: unique, teachingCount }
}

/**
 * Can another teaching period still be added to this day? Handy for enabling/
 * disabling an "add period" button in the timetable UI.
 */
export function canAddTeachingPeriod(
  slots: TimetableDaySlotInput[],
  opts: ValidateOptions = {},
): boolean {
  const maxTeaching = opts.maxTeachingPeriods ?? MAX_TEACHING_PERIODS_PER_DAY
  const nonTeaching = new Set(opts.nonTeachingTypes ?? DEFAULT_NON_TEACHING_TYPES)
  const teachingCount = slots.filter((s) => !nonTeaching.has(s.type)).length
  return teachingCount < maxTeaching
}
