import { describe, it, expect } from 'vitest'
import { computeDueReminders, type ReminderSlotInput } from './class-reminders'

const times = [
  { period: 1, startTime: '09:00' }, // 540
  { period: 2, startTime: '10:00' }, // 600
  { period: 4, startTime: '12:00' }, // 720 (lunch)
]
function slot(period: number, type: string, subjectName: string | null): ReminderSlotInput {
  return { period, type, subjectName }
}

describe('computeDueReminders', () => {
  it('fires when now is inside the lead window before start', () => {
    // P1 at 09:00, lead 10 -> window [08:50, 09:00). 08:52 = 532.
    const due = computeDueReminders({
      slots: [slot(1, 'class', 'Data Structures')],
      periodTimes: times,
      nowMinutes: 532,
      leadMinutes: 10,
    })
    expect(due).toHaveLength(1)
    expect(due[0].period).toBe(1)
    expect(due[0].body).toContain('Data Structures')
    expect(due[0].body).toContain('09:00')
  })

  it('does not fire before the window opens', () => {
    // 08:49 = 529, window opens at 530.
    const due = computeDueReminders({ slots: [slot(1, 'class', 'DS')], periodTimes: times, nowMinutes: 529, leadMinutes: 10 })
    expect(due).toEqual([])
  })

  it('does not fire once the class has already started', () => {
    // 09:00 = 540 -> at/after start, no late reminder.
    const due = computeDueReminders({ slots: [slot(1, 'class', 'DS')], periodTimes: times, nowMinutes: 540, leadMinutes: 10 })
    expect(due).toEqual([])
  })

  it('excludes lunch even inside its lead window', () => {
    // P4 at 12:00, window [11:50,12:00). 11:52 = 712.
    const due = computeDueReminders({
      slots: [slot(4, 'lunch', null)],
      periodTimes: times,
      nowMinutes: 712,
      leadMinutes: 10,
    })
    expect(due).toEqual([])
  })

  it('excludes meeting even inside its lead window', () => {
    // P2 at 10:00, window [09:50,10:00). 09:52 = 592.
    const due = computeDueReminders({
      slots: [slot(2, 'meeting', 'Dept meeting')],
      periodTimes: times,
      nowMinutes: 592,
      leadMinutes: 10,
    })
    expect(due).toEqual([])
  })

  it('reminds for mentoring, unlike lunch/meeting', () => {
    const due = computeDueReminders({
      slots: [slot(2, 'mentoring', 'Mentoring')],
      periodTimes: times,
      nowMinutes: 592, // inside P2's window
      leadMinutes: 10,
    })
    expect(due.map((d) => d.period)).toEqual([2])
  })

  it('reminds for minor, same as a normal class', () => {
    const due = computeDueReminders({
      slots: [slot(1, 'minor', 'Minor project')],
      periodTimes: times,
      nowMinutes: 532, // inside P1's window
      leadMinutes: 10,
    })
    expect(due.map((d) => d.period)).toEqual([1])
  })

  it('returns nothing when the period has no allocated time', () => {
    const due = computeDueReminders({
      slots: [slot(3, 'class', 'Networks')], // period 3 has no time entry
      periodTimes: times,
      nowMinutes: 600,
      leadMinutes: 10,
    })
    expect(due).toEqual([])
  })

  it('returns nothing when there are no period times at all (graceful degradation)', () => {
    const due = computeDueReminders({ slots: [slot(1, 'class', 'DS')], periodTimes: [], nowMinutes: 532, leadMinutes: 10 })
    expect(due).toEqual([])
  })

  it('honors a custom lead time', () => {
    // lead 30 -> P1 window [08:30, 09:00). 08:35 = 515.
    const due = computeDueReminders({ slots: [slot(1, 'class', 'DS')], periodTimes: times, nowMinutes: 515, leadMinutes: 30 })
    expect(due).toHaveLength(1)
  })
})
