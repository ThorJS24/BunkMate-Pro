import { describe, it, expect } from 'vitest'
import { computeDueWeeklyDigest } from './weekly-digest'

const BASE_DIGEST = { overallPercentage: 87.5, subjectsBelowTarget: 0, examCountNextWeek: 0 }

describe('computeDueWeeklyDigest', () => {
  it('is not due on a non-Sunday', () => {
    expect(
      computeDueWeeklyDigest({ todayIso: '2026-08-03', jsWeekday: 1, nowMinutes: 19 * 60, digest: BASE_DIGEST }),
    ).toBeNull()
  })

  it('is not due before the evening hour on a Sunday', () => {
    expect(
      computeDueWeeklyDigest({ todayIso: '2026-08-02', jsWeekday: 0, nowMinutes: 10 * 60, digest: BASE_DIGEST }),
    ).toBeNull()
  })

  it('fires on Sunday evening with a keyed, summarized body', () => {
    const result = computeDueWeeklyDigest({
      todayIso: '2026-08-02',
      jsWeekday: 0,
      nowMinutes: 18 * 60 + 5,
      digest: { overallPercentage: 82.3, subjectsBelowTarget: 2, examCountNextWeek: 1 },
    })
    expect(result?.key).toBe('weekly-digest:2026-08-02')
    expect(result?.body).toBe('Overall: 82.3% · 2 subjects below target · 1 exam next week')
  })

  it('reports no attendance recorded yet when there is none', () => {
    const result = computeDueWeeklyDigest({
      todayIso: '2026-08-02',
      jsWeekday: 0,
      nowMinutes: 18 * 60,
      digest: { overallPercentage: null, subjectsBelowTarget: 0, examCountNextWeek: 0 },
    })
    expect(result?.body).toBe('No attendance recorded yet')
  })
})
