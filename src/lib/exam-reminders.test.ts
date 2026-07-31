import { describe, it, expect } from 'vitest'
import { computeDueExamReminders, type ExamReminderInput } from './exam-reminders'

const exam = (over: Partial<ExamReminderInput> = {}): ExamReminderInput => ({
  id: 1,
  name: 'Mathematics II',
  courseCode: 'MA231',
  date: '2026-04-15',
  startTime: '09:30',
  reportingTime: '09:15',
  location: 'Room K224',
  ...over,
})

const at = (h: number, m = 0) => h * 60 + m

describe('computeDueExamReminders', () => {
  it('fires the evening before, from 18:00', () => {
    const args = { exams: [exam()], todayIso: '2026-04-14', nowMinutes: at(18) }
    const [due] = computeDueExamReminders(args)
    expect(due.kind).toBe('evening-before')
    expect(due.title).toBe('Exam tomorrow: MA231: Mathematics II')
    expect(due.body).toBe('09:30 · Room K224 (report 09:15)')
  })

  it('is not due earlier in the evening-before day', () => {
    expect(
      computeDueExamReminders({ exams: [exam()], todayIso: '2026-04-14', nowMinutes: at(17, 59) }),
    ).toEqual([])
  })

  it('fires on the morning of, from 07:00', () => {
    const [due] = computeDueExamReminders({ exams: [exam()], todayIso: '2026-04-15', nowMinutes: at(7) })
    expect(due.kind).toBe('morning-of')
    expect(due.title).toBe('Exam today: MA231: Mathematics II')
  })

  // Opening the app mid-exam shouldn't announce it.
  it('suppresses the morning-of reminder once the exam has started', () => {
    expect(
      computeDueExamReminders({ exams: [exam()], todayIso: '2026-04-15', nowMinutes: at(9, 31) }),
    ).toEqual([])
  })

  it('still reminds on the day when the exam has no start time', () => {
    const [due] = computeDueExamReminders({
      exams: [exam({ startTime: null })],
      todayIso: '2026-04-15',
      nowMinutes: at(14),
    })
    expect(due.kind).toBe('morning-of')
  })

  it('ignores exams on other days', () => {
    expect(
      computeDueExamReminders({ exams: [exam({ date: '2026-05-01' })], todayIso: '2026-04-14', nowMinutes: at(20) }),
    ).toEqual([])
  })

  it('gives each exam+kind a distinct key so each fires once', () => {
    const evening = computeDueExamReminders({ exams: [exam()], todayIso: '2026-04-14', nowMinutes: at(20) })
    const morning = computeDueExamReminders({ exams: [exam()], todayIso: '2026-04-15', nowMinutes: at(8) })
    expect(evening[0].key).toBe('exam:1:evening-before')
    expect(morning[0].key).toBe('exam:1:morning-of')
  })

  it('degrades to a usable message with no code, time or venue', () => {
    const [due] = computeDueExamReminders({
      exams: [exam({ courseCode: null, startTime: null, reportingTime: null, location: null })],
      todayIso: '2026-04-14',
      nowMinutes: at(19),
    })
    expect(due.title).toBe('Exam tomorrow: Mathematics II')
    expect(due.body).toBe('Check the time and venue on your hall ticket.')
  })

  it('reminds about every exam in a sitting on the same day', () => {
    const due = computeDueExamReminders({
      exams: [exam({ id: 1 }), exam({ id: 2, name: 'Physics', courseCode: 'PH232P' })],
      todayIso: '2026-04-14',
      nowMinutes: at(18, 30),
    })
    expect(due.map((d) => d.key)).toEqual(['exam:1:evening-before', 'exam:2:evening-before'])
  })
})
