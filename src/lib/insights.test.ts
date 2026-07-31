import { describe, it, expect } from 'vitest'
import {
  computeCurrentStreak,
  computeStreaksBySubject,
  computeProjection,
  cumulativeAttendanceSeries,
  computeRecoveryPlan,
  type StreakRecordInput,
} from './insights'

function rec(subjectId: number, date: string, period: number, status: 'present' | 'absent'): StreakRecordInput {
  return { subjectId, date, period, status }
}

describe('computeCurrentStreak', () => {
  it('counts trailing consecutive presents', () => {
    const recs = [
      rec(1, '2026-01-01', 1, 'present'),
      rec(1, '2026-01-02', 1, 'absent'),
      rec(1, '2026-01-03', 1, 'present'),
      rec(1, '2026-01-04', 1, 'present'),
    ]
    expect(computeCurrentStreak(recs)).toBe(2)
  })

  it('is 0 when the most recent record is an absence', () => {
    const recs = [rec(1, '2026-01-01', 1, 'present'), rec(1, '2026-01-02', 1, 'absent')]
    expect(computeCurrentStreak(recs)).toBe(0)
  })

  it('is 0 with no records', () => {
    expect(computeCurrentStreak([])).toBe(0)
  })

  it('orders by date then period, not input order', () => {
    // Same day, later period is absent -> streak breaks there even though it
    // was passed in first.
    const recs = [
      rec(1, '2026-01-05', 3, 'absent'),
      rec(1, '2026-01-05', 1, 'present'),
      rec(1, '2026-01-05', 2, 'present'),
    ]
    expect(computeCurrentStreak(recs)).toBe(0)
  })

  it('counts a full unbroken run', () => {
    const recs = [
      rec(1, '2026-01-01', 1, 'present'),
      rec(1, '2026-01-02', 1, 'present'),
      rec(1, '2026-01-03', 1, 'present'),
    ]
    expect(computeCurrentStreak(recs)).toBe(3)
  })
})

describe('computeStreaksBySubject', () => {
  it('computes an independent streak per subject', () => {
    const recs = [
      rec(1, '2026-01-01', 1, 'present'),
      rec(1, '2026-01-02', 1, 'present'),
      rec(2, '2026-01-01', 2, 'absent'),
      rec(2, '2026-01-02', 2, 'present'),
    ]
    const streaks = computeStreaksBySubject(recs)
    expect(streaks.get(1)).toBe(2)
    expect(streaks.get(2)).toBe(1)
  })
})

describe('cumulativeAttendanceSeries', () => {
  it('produces the running percentage after each record in order', () => {
    const recs = [
      rec(1, '2026-01-01', 1, 'present'),
      rec(1, '2026-01-02', 1, 'absent'),
      rec(1, '2026-01-03', 1, 'present'),
      rec(1, '2026-01-04', 1, 'present'),
    ]
    const series = cumulativeAttendanceSeries(recs)
    expect(series).toEqual([100, 50, (2 / 3) * 100, 75])
  })

  it('returns an empty series for no records', () => {
    expect(cumulativeAttendanceSeries([])).toEqual([])
  })
})

describe('computeProjection', () => {
  it('projects best and worst case from remaining periods', () => {
    // 15/20 now (75%), 10 remaining.
    const p = computeProjection({ attended: 15, total: 20, remaining: 10, target: 75 })
    expect(p.remaining).toBe(10)
    expect(p.ifAllAttended).toBeCloseTo((25 / 30) * 100) // 83.33%
    expect(p.ifNoneAttended).toBeCloseTo((15 / 30) * 100) // 50%
  })

  it('reports the target reachable and classes needed when it is', () => {
    // 6/10 (60%), target 75, 20 remaining — reachable.
    const p = computeProjection({ attended: 6, total: 10, remaining: 20, target: 75 })
    expect(p.targetReachable).toBe(true)
    expect(p.classesNeededForTarget).toBe(6) // ceil((0.75*10-6)/(1-0.75)) = ceil(1.5/0.25)=6
  })

  it('reports the target unreachable when not enough periods remain', () => {
    // 6/10 (60%), target 75, only 3 remaining — needs 6, can't.
    const p = computeProjection({ attended: 6, total: 10, remaining: 3, target: 75 })
    expect(p.targetReachable).toBe(false)
    expect(p.classesNeededForTarget).toBeNull()
  })

  it('returns null percentages when nothing is or will be scheduled', () => {
    const p = computeProjection({ attended: 0, total: 0, remaining: 0, target: 75 })
    expect(p.ifAllAttended).toBeNull()
    expect(p.ifNoneAttended).toBeNull()
  })
})

describe('computeRecoveryPlan', () => {
  const futureDates = ['2026-03-02', '2026-03-04', '2026-03-06', '2026-03-09', '2026-03-11', '2026-03-13']

  it('is on track when already at/above target', () => {
    const plan = computeRecoveryPlan({ attended: 9, total: 10, target: 75, futureDates })
    expect(plan.onTrack).toBe(true)
    expect(plan.attendDates).toEqual([])
    expect(plan.clearByDate).toBeNull()
  })

  it('lists the exact next sessions to attend and the clear-by date', () => {
    // 6/10 = 60%, target 75 -> needs 6 consecutive attended.
    const plan = computeRecoveryPlan({ attended: 6, total: 10, target: 75, futureDates })
    expect(plan.needed).toBe(6)
    expect(plan.impossible).toBe(false)
    expect(plan.attendDates).toEqual(futureDates.slice(0, 6))
    expect(plan.clearByDate).toBe('2026-03-13')
  })

  it('flags impossible when not enough future sessions remain', () => {
    // needs 6 but only 3 remain.
    const plan = computeRecoveryPlan({ attended: 6, total: 10, target: 75, futureDates: futureDates.slice(0, 3) })
    expect(plan.impossible).toBe(true)
    expect(plan.attendDates).toEqual([])
    expect(plan.clearByDate).toBeNull()
  })
})
