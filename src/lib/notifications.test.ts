import { describe, it, expect } from 'vitest'
import { buildNotifications, type NotificationSubjectInput, type NotificationHolidayInput } from './notifications'
import type { BucketStats } from './attendance-engine'

const TODAY = '2026-07-16'

function stats(attended: number, total: number): BucketStats {
  return { attended, total, percentage: total === 0 ? null : (attended / total) * 100 }
}

function subject(id: number, name: string, customMinTarget: number | null = null): NotificationSubjectInput {
  return { id, name, customMinTarget }
}

describe('buildNotifications', () => {
  it('fires the overall warning off overallMinTarget, independent of subjectMinTarget', () => {
    // Overall is at 60%, which is below an 80% overallMinTarget but above a
    // (hypothetically lower) subjectMinTarget - proving the overall check
    // uses its own target, not the subject default.
    const notifications = buildNotifications({
      subjects: [],
      bySubjectOverall: new Map(),
      overall: stats(6, 10),
      overallMinTarget: 80,
      subjectMinTarget: 50,
      holidays: [],
      today: TODAY,
    })

    expect(notifications).toContainEqual({
      id: 'overall-below-target',
      category: 'overall-below',
      severity: 'critical',
      title: 'Overall attendance is below target',
      description: '60.0% attended, target is 80%.',
    })
  })

  it('does not fire the overall warning when overall is at or above overallMinTarget', () => {
    const notifications = buildNotifications({
      subjects: [],
      bySubjectOverall: new Map(),
      overall: stats(8, 10),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications.find((n) => n.id === 'overall-below-target')).toBeUndefined()
  })

  it("fires a subject's below-target warning off its resolved target (the default subject minimum)", () => {
    const s = subject(1, 'Operating Systems')
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(6, 10)]]), // 60%
      overall: stats(6, 10),
      overallMinTarget: 50, // deliberately low, so only the subject check should fire
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications).toContainEqual({
      id: 'below-target-1',
      category: 'subject-below',
      severity: 'critical',
      title: 'Operating Systems is below target',
      description: '60.0% attended, target is 75%.',
    })
  })

  it("a subject's override takes precedence over the default subject minimum", () => {
    const overridden = subject(1, 'Data Structures', 40) // override well below the default
    // 60% clears the 40% override, so no below-target/at-risk notification
    // should fire, even though 60% would fail the 75% default.
    const notifications = buildNotifications({
      subjects: [overridden],
      bySubjectOverall: new Map([[1, stats(6, 10)]]),
      overall: stats(6, 10),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications.find((n) => n.id === 'below-target-1')).toBeUndefined()
    expect(notifications.find((n) => n.id === 'at-risk-1')).toBeUndefined()

    // Conversely, an override *above* the default fires where the default
    // alone would not have.
    const stricter = subject(2, 'Networks', 90)
    const notifications2 = buildNotifications({
      subjects: [stricter],
      bySubjectOverall: new Map([[2, stats(8, 10)]]), // 80% - clears a 75% default, fails a 90% override
      overall: stats(8, 10),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications2).toContainEqual({
      id: 'below-target-2',
      category: 'subject-below',
      severity: 'critical',
      title: 'Networks is below target',
      description: '80.0% attended, target is 90%.',
    })
  })

  it('respects a custom atRiskMarginPp for the at-risk band', () => {
    const s = subject(1, 'Data Structures')
    // 82% with target 75: within a 10-pt band (fires) but outside the default
    // 5-pt band (wouldn't).
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(82, 100)]]),
      overall: stats(82, 100),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      atRiskMarginPp: 10,
      holidays: [],
      today: TODAY,
    })
    expect(notifications.find((n) => n.id === 'at-risk-1')).toBeTruthy()
  })

  it('disables the at-risk band entirely when atRiskMarginPp is 0', () => {
    const s = subject(1, 'Data Structures')
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(9, 12)]]), // 75%, would be at-risk by default
      overall: stats(9, 12),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      atRiskMarginPp: 0,
      holidays: [],
      today: TODAY,
    })
    expect(notifications.find((n) => n.id === 'at-risk-1')).toBeUndefined()
  })

  it('fires an at-risk warning when within 5 points of the resolved target but not below it', () => {
    const s = subject(1, 'Data Structures')
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(9, 12)]]), // 75%
      overall: stats(9, 12),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications).toContainEqual({
      id: 'at-risk-1',
      category: 'subject-at-risk',
      severity: 'warning',
      title: 'Data Structures is close to the target',
      description: '75.0% attended, within 5 points of 75%.',
    })
  })

  it('fires a safe-bunk-zero warning when at/above target but with no safe bunks left', () => {
    const s = subject(1, 'Data Structures')
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(9, 12)]]), // 75%, floor(9*100/75)-12 = 0 safe bunks
      overall: stats(9, 12),
      overallMinTarget: 75,
      subjectMinTarget: 75,
      holidays: [],
      today: TODAY,
    })

    expect(notifications).toContainEqual({
      id: 'safe-bunk-zero-1',
      category: 'safe-bunk',
      severity: 'warning',
      title: 'Data Structures has no safe bunks left',
      description: 'Missing the next class would drop you below target.',
    })
  })

  it('includes upcoming holidays within the window and sorts by severity', () => {
    const holidays: NotificationHolidayInput[] = [
      { id: 1, date: '2026-07-20', label: 'Founders Day', type: 'university' },
      { id: 2, date: '2026-09-01', label: 'Too far out', type: 'university' },
    ]
    const s = subject(1, 'Operating Systems')
    const notifications = buildNotifications({
      subjects: [s],
      bySubjectOverall: new Map([[1, stats(6, 10)]]), // below target -> critical
      overall: stats(6, 10),
      overallMinTarget: 75, // also below -> critical
      subjectMinTarget: 75,
      holidays,
      today: TODAY,
    })

    expect(notifications.find((n) => n.id === 'holiday-1')).toBeTruthy()
    expect(notifications.find((n) => n.id === 'holiday-2')).toBeUndefined()
    // critical entries (overall + subject) must sort ahead of the info holiday entry
    expect(notifications[notifications.length - 1].severity).toBe('info')
    expect(notifications.slice(0, -1).every((n) => n.severity === 'critical')).toBe(true)
  })
})
