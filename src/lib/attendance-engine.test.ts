import { describe, it, expect } from 'vitest'
import {
  computeAttendance,
  aggregateOverall,
  computeSafeBunkCount,
  computeClassesNeededToReachTarget,
  resolveSubjectMinTarget,
  enumerateScheduledPeriods,
  scheduledPeriodsForDates,
  projectRecords,
  jsDayToWeekday,
  type PeriodTypeRule,
  type TimetableSlotInput,
  type TimetableSlotWithSchedule,
  type AttendanceRecordInput,
  type HolidayInput,
  type YellowFormInput,
} from './attendance-engine'

const RULES: PeriodTypeRule[] = [
  { type: 'class', bucket: 'normal' },
  { type: 'project', bucket: 'project' },
  { type: 'mentoring', bucket: 'project' },
  { type: 'minor', bucket: 'project' },
  { type: 'meeting', bucket: 'excluded' },
  { type: 'lunch', bucket: 'ignored' },
]

const SUBJECT_ID = 1

function slot(id: number, type: string): TimetableSlotInput {
  return { id, subjectId: SUBJECT_ID, type }
}

function record(overrides: Partial<AttendanceRecordInput>): AttendanceRecordInput {
  return {
    subjectId: SUBJECT_ID,
    date: '2026-01-05',
    period: 1,
    status: 'present',
    slotId: null,
    ...overrides,
  }
}

describe('computeAttendance', () => {
  it('counts a normal class period toward overall and classWork only', () => {
    const slots = [slot(1, 'class')]
    const records = [record({ slotId: 1, status: 'present' })]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })
    const stats = result.get(SUBJECT_ID)!

    expect(stats.overall).toEqual({ total: 1, attended: 1, percentage: 100 })
    expect(stats.classWork).toEqual({ total: 1, attended: 1, percentage: 100 })
    expect(stats.projectWork).toEqual({ total: 0, attended: 0, percentage: null })
  })

  it('excludes meeting periods entirely (meeting-only day contributes nothing)', () => {
    const slots = [slot(1, 'meeting'), slot(2, 'meeting')]
    const records = [
      record({ slotId: 1, period: 1, status: 'present' }),
      record({ slotId: 2, period: 2, status: 'absent' }),
    ]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })

    expect(result.has(SUBJECT_ID)).toBe(false)
  })

  it('ignores lunch periods entirely', () => {
    const slots = [slot(1, 'lunch')]
    const records = [record({ slotId: 1, status: 'absent' })]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })

    expect(result.has(SUBJECT_ID)).toBe(false)
  })

  it('folds mentoring and minor periods into projectWork, and also into overall', () => {
    const slots = [slot(1, 'mentoring'), slot(2, 'minor'), slot(3, 'class')]
    const records = [
      record({ slotId: 1, period: 1, status: 'present' }),
      record({ slotId: 2, period: 2, status: 'absent' }),
      record({ slotId: 3, period: 3, status: 'present' }),
    ]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })
    const stats = result.get(SUBJECT_ID)!

    expect(stats.projectWork).toEqual({ total: 2, attended: 1, percentage: 50 })
    expect(stats.classWork).toEqual({ total: 1, attended: 1, percentage: 100 })
    // overall folds class + project work together
    expect(stats.overall).toEqual({ total: 3, attended: 2, percentage: (2 / 3) * 100 })
  })

  it('excludes every scheduled period during an all-holiday week', () => {
    const slots = [slot(1, 'class')]
    const holidayDates = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09']
    const holidays: HolidayInput[] = holidayDates.map((date) => ({ date, type: 'university' }))
    const records = holidayDates.map((date, i) => record({ slotId: 1, date, period: 1, status: i % 2 === 0 ? 'present' : 'absent' }))

    const result = computeAttendance({ records, slots, holidays, yellowForms: [], rules: RULES })

    expect(result.has(SUBJECT_ID)).toBe(false)
  })

  it('does not exclude periods on a working_saturday holiday entry', () => {
    const slots = [slot(1, 'class')]
    const holidays: HolidayInput[] = [{ date: '2026-01-10', type: 'working_saturday' }]
    const records = [record({ slotId: 1, date: '2026-01-10', status: 'present' })]

    const result = computeAttendance({ records, slots, holidays, yellowForms: [], rules: RULES })

    expect(result.get(SUBJECT_ID)!.overall).toEqual({ total: 1, attended: 1, percentage: 100 })
  })

  it('flips an absent record to counted-as-attended when an approved yellow form covers it', () => {
    const slots = [slot(1, 'class')]
    const records = [record({ slotId: 1, period: 3, status: 'absent' })]
    const yellowForms: YellowFormInput[] = [
      { id: 1, subjectId: SUBJECT_ID, date: '2026-01-05', period: 3, status: 'approved' },
    ]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms, rules: RULES })

    expect(result.get(SUBJECT_ID)!.overall).toEqual({ total: 1, attended: 1, percentage: 100 })
    // the underlying record itself is untouched
    expect(records[0].status).toBe('absent')
  })

  it('does not adjust for a pending or rejected yellow form', () => {
    const slots = [slot(1, 'class')]
    const records = [record({ slotId: 1, period: 3, status: 'absent' })]
    const yellowForms: YellowFormInput[] = [
      { id: 1, subjectId: SUBJECT_ID, date: '2026-01-05', period: 3, status: 'pending' },
    ]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms, rules: RULES })

    expect(result.get(SUBJECT_ID)!.overall).toEqual({ total: 1, attended: 0, percentage: 0 })
  })

  it('applies a whole-day yellow form (period: null) to every period that date', () => {
    const slots = [slot(1, 'class'), slot(2, 'class')]
    const records = [
      record({ slotId: 1, period: 1, status: 'absent' }),
      record({ slotId: 2, period: 2, status: 'absent' }),
    ]
    const yellowForms: YellowFormInput[] = [
      { id: 1, subjectId: SUBJECT_ID, date: '2026-01-05', period: null, status: 'approved' },
    ]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms, rules: RULES })

    expect(result.get(SUBJECT_ID)!.overall).toEqual({ total: 2, attended: 2, percentage: 100 })
  })

  it('defaults an unknown period type to the normal bucket rather than dropping it', () => {
    const slots = [slot(1, 'guest-lecture')]
    const records = [record({ slotId: 1, status: 'present' })]

    const result = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })

    expect(result.get(SUBJECT_ID)!.classWork).toEqual({ total: 1, attended: 1, percentage: 100 })
  })

  it('treats a record with no slot (manual entry) as a normal class period', () => {
    const records = [record({ slotId: null, status: 'present' })]

    const result = computeAttendance({ records, slots: [], holidays: [], yellowForms: [], rules: RULES })

    expect(result.get(SUBJECT_ID)!.classWork.total).toBe(1)
  })
})

describe('aggregateOverall', () => {
  it('sums stats across multiple subjects', () => {
    const slots = [slot(1, 'class'), slot(2, 'class')]
    const records = [
      { subjectId: 1, date: '2026-01-05', period: 1, status: 'present' as const, slotId: 1 },
      { subjectId: 2, date: '2026-01-05', period: 1, status: 'absent' as const, slotId: 2 },
    ]

    const bySubject = computeAttendance({ records, slots, holidays: [], yellowForms: [], rules: RULES })
    const overall = aggregateOverall(bySubject)

    expect(overall).toEqual({ total: 2, attended: 1, percentage: 50 })
  })

  it('returns a null percentage with zero subjects/records', () => {
    const overall = aggregateOverall(new Map())
    expect(overall).toEqual({ total: 0, attended: 0, percentage: null })
  })
})

describe('computeSafeBunkCount', () => {
  it('computes how many more absences are tolerable at 75% target', () => {
    // 30/40 = 75% already at target -> 0 safe bunks
    expect(computeSafeBunkCount(30, 40, 75)).toBe(0)
    // 39/40 = 97.5%; floor(39*100/75) = 52 -> 52-40 = 12
    expect(computeSafeBunkCount(39, 40, 75)).toBe(12)
  })

  it('returns 0 when already below target', () => {
    expect(computeSafeBunkCount(10, 40, 75)).toBe(0)
  })

  it('returns 0 when target is 100%', () => {
    expect(computeSafeBunkCount(40, 40, 100)).toBe(0)
  })
})

describe('resolveSubjectMinTarget', () => {
  it('falls back to the default subject minimum when customMinTarget is null', () => {
    expect(resolveSubjectMinTarget({ customMinTarget: null }, 75)).toBe(75)
  })

  it('an override takes precedence over the default', () => {
    expect(resolveSubjectMinTarget({ customMinTarget: 90 }, 75)).toBe(90)
    // even when the override is lower than the default - it's still an
    // explicit choice and must win, not just the "stricter of the two".
    expect(resolveSubjectMinTarget({ customMinTarget: 50 }, 75)).toBe(50)
  })
})

describe('computeClassesNeededToReachTarget', () => {
  it('returns 0 when already at or above target', () => {
    expect(computeClassesNeededToReachTarget(30, 40, 75)).toBe(0)
  })

  it('computes classes needed when below target', () => {
    // 20/40 = 50%, need n such that (20+n)/(40+n) >= 0.75
    // n >= (0.75*40 - 20) / (1-0.75) = (30-20)/0.25 = 40
    expect(computeClassesNeededToReachTarget(20, 40, 75)).toBe(40)
  })

  it('returns 0 with zero total (nothing attended yet still reads as 100%)', () => {
    expect(computeClassesNeededToReachTarget(0, 0, 75)).toBe(0)
  })
})

describe('jsDayToWeekday', () => {
  it('maps an ISO date string to the timetable weekday, and Sunday to null', () => {
    // 2026-01-04 is a Sunday, 2026-01-05 is a Monday
    expect(jsDayToWeekday('2026-01-04')).toBeNull()
    expect(jsDayToWeekday('2026-01-05')).toBe('mon')
    expect(jsDayToWeekday('2026-01-10')).toBe('sat')
  })
})

describe('enumerateScheduledPeriods', () => {
  const slots: TimetableSlotWithSchedule[] = [
    { id: 1, subjectId: SUBJECT_ID, type: 'class', day: 'mon', period: 1 },
    { id: 2, subjectId: SUBJECT_ID, type: 'class', day: 'wed', period: 1 },
  ]

  it('expands the weekly timetable across a date range, in date/period order', () => {
    // 2026-01-05 Mon, 2026-01-07 Wed, 2026-01-12 Mon
    const result = enumerateScheduledPeriods({
      slots,
      holidays: [],
      startDate: '2026-01-05',
      endDate: '2026-01-12',
    })

    expect(result.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-07', '2026-01-12'])
  })

  it('skips Sundays entirely (no matching weekday slots)', () => {
    const result = enumerateScheduledPeriods({
      slots,
      holidays: [],
      startDate: '2026-01-04', // Sunday
      endDate: '2026-01-04',
    })
    expect(result).toHaveLength(0)
  })

  it('excludes a scheduled period that falls on an excluding holiday', () => {
    const result = enumerateScheduledPeriods({
      slots,
      holidays: [{ date: '2026-01-05', type: 'university' }],
      startDate: '2026-01-05',
      endDate: '2026-01-05',
    })
    expect(result).toHaveLength(0)
  })

  it('does not exclude a scheduled period on a working_saturday', () => {
    const satSlots: TimetableSlotWithSchedule[] = [
      { id: 3, subjectId: SUBJECT_ID, type: 'class', day: 'sat', period: 1 },
    ]
    const result = enumerateScheduledPeriods({
      slots: satSlots,
      holidays: [{ date: '2026-01-10', type: 'working_saturday' }], // a Saturday
      startDate: '2026-01-10',
      endDate: '2026-01-10',
    })
    expect(result).toHaveLength(1)
  })
})

describe('scheduledPeriodsForDates', () => {
  it('resolves an arbitrary (non-contiguous) list of dates, skipping non-matching weekdays', () => {
    const slots: TimetableSlotWithSchedule[] = [
      { id: 1, subjectId: SUBJECT_ID, type: 'class', day: 'mon', period: 1 },
    ]
    // 2026-01-05 is Mon, 2026-01-06 is Tue (no slot), 2026-01-12 is Mon
    const result = scheduledPeriodsForDates({
      slots,
      holidays: [],
      dates: ['2026-01-05', '2026-01-06', '2026-01-12'],
    })
    expect(result.map((p) => p.date)).toEqual(['2026-01-05', '2026-01-12'])
  })
})

describe('projectRecords + computeAttendance (simulator scenarios)', () => {
  const slots: TimetableSlotWithSchedule[] = [
    { id: 1, subjectId: SUBJECT_ID, type: 'class', day: 'mon', period: 1 },
  ]

  it('projects "attend everything remaining" as an improvement over the baseline', () => {
    const pastRecords: AttendanceRecordInput[] = [
      { subjectId: SUBJECT_ID, date: '2026-01-05', period: 1, status: 'absent', slotId: 1 },
    ]
    const future = enumerateScheduledPeriods({
      slots,
      holidays: [],
      startDate: '2026-01-12',
      endDate: '2026-01-26',
    })
    const hypothetical = projectRecords(future, 'present')

    const baseline = computeAttendance({
      records: pastRecords,
      slots,
      holidays: [],
      yellowForms: [],
      rules: RULES,
    })
    const projected = computeAttendance({
      records: [...pastRecords, ...hypothetical],
      slots,
      holidays: [],
      yellowForms: [],
      rules: RULES,
    })

    expect(baseline.get(SUBJECT_ID)!.overall.percentage).toBe(0)
    // 1 absent + 3 future Mondays attended = 3/4 = 75%
    expect(projected.get(SUBJECT_ID)!.overall).toEqual({ total: 4, attended: 3, percentage: 75 })
  })

  it('projects a leave-for-N-days scenario as a decline', () => {
    const pastRecords: AttendanceRecordInput[] = [
      { subjectId: SUBJECT_ID, date: '2026-01-05', period: 1, status: 'present', slotId: 1 },
    ]
    const leaveRange = enumerateScheduledPeriods({
      slots,
      holidays: [],
      startDate: '2026-01-12',
      endDate: '2026-01-12',
    })
    const hypothetical = projectRecords(leaveRange, 'absent')

    const projected = computeAttendance({
      records: [...pastRecords, ...hypothetical],
      slots,
      holidays: [],
      yellowForms: [],
      rules: RULES,
    })

    expect(projected.get(SUBJECT_ID)!.overall).toEqual({ total: 2, attended: 1, percentage: 50 })
  })

  it('projects a yellow form approval by overriding just that form\'s status', () => {
    const records: AttendanceRecordInput[] = [
      { subjectId: SUBJECT_ID, date: '2026-01-05', period: 1, status: 'absent', slotId: 1 },
    ]
    const forms: YellowFormInput[] = [
      { id: 42, subjectId: SUBJECT_ID, date: '2026-01-05', period: 1, status: 'pending' },
    ]

    const baseline = computeAttendance({ records, slots, holidays: [], yellowForms: forms, rules: RULES })
    expect(baseline.get(SUBJECT_ID)!.overall.attended).toBe(0)

    const withApproval = forms.map((f) => (f.id === 42 ? { ...f, status: 'approved' as const } : f))
    const projected = computeAttendance({
      records,
      slots,
      holidays: [],
      yellowForms: withApproval,
      rules: RULES,
    })
    expect(projected.get(SUBJECT_ID)!.overall.attended).toBe(1)
  })
})
