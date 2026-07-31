import { describe, it, expect } from 'vitest'
import {
  resolveDayPeriods,
  autoPresentRecords,
  minutesSinceMidnight,
  buildPeriodEndMinutesForDay,
  type ResolveDayParams,
  type PeriodTimeSlot,
} from './day-attendance'
import type { ScheduledPeriod, AttendanceRecordInput } from './attendance-engine'

const TODAY = '2026-07-16'
// period -> end minute of day (e.g. P1 ends 09:50 => 590)
const ENDS = { 1: 590, 2: 640, 3: 730, 4: 780, 5: 870, 6: 920 }

function period(p: number, opts: Partial<ScheduledPeriod> = {}): ScheduledPeriod {
  return {
    date: opts.date ?? TODAY,
    day: opts.day ?? 'thu',
    period: p,
    subjectId: opts.subjectId ?? 100 + p,
    type: opts.type ?? 'class',
    slotId: opts.slotId ?? 900 + p,
  }
}

function params(over: Partial<ResolveDayParams>): ResolveDayParams {
  return {
    scheduledPeriods: over.scheduledPeriods ?? [],
    records: over.records ?? [],
    todayIso: over.todayIso ?? TODAY,
    nowMinutes: over.nowMinutes ?? 12 * 60, // noon
    periodEndMinutes: over.periodEndMinutes ?? ENDS,
  }
}

describe('resolveDayPeriods', () => {
  it('auto-presents a class earlier today whose end time has passed', () => {
    const r = resolveDayPeriods(params({ scheduledPeriods: [period(1)], nowMinutes: 600 }))
    expect(r).toHaveLength(1)
    expect(r[0].effectiveStatus).toBe('auto_present')
    expect(r[0].explicit).toBe(false)
  })

  it('treats a class still to come later today as upcoming', () => {
    // P5 ends 14:30 (870); now is 12:00 (720-ish) -> not over yet
    const r = resolveDayPeriods(params({ scheduledPeriods: [period(5)], nowMinutes: 720 }))
    expect(r[0].effectiveStatus).toBe('upcoming')
  })

  it('counts a period as over exactly at its end minute (>= boundary)', () => {
    const r = resolveDayPeriods(params({ scheduledPeriods: [period(2)], nowMinutes: 640 }))
    expect(r[0].effectiveStatus).toBe('auto_present')
  })

  it('leaves a class upcoming when its end time is unknown', () => {
    const r = resolveDayPeriods(params({ scheduledPeriods: [period(3)], periodEndMinutes: {}, nowMinutes: 1439 }))
    expect(r[0].effectiveStatus).toBe('upcoming')
  })

  it('auto-presents every class on a past date regardless of clock', () => {
    const r = resolveDayPeriods(params({
      scheduledPeriods: [period(1, { date: '2026-07-10' }), period(6, { date: '2026-07-10' })],
      nowMinutes: 0,
    }))
    expect(r.map((p) => p.effectiveStatus)).toEqual(['auto_present', 'auto_present'])
  })

  it('marks a future date as upcoming', () => {
    const r = resolveDayPeriods(params({ scheduledPeriods: [period(1, { date: '2026-07-20' })], nowMinutes: 1439 }))
    expect(r[0].effectiveStatus).toBe('upcoming')
  })

  it('lets an explicit ABSENT override the auto-present default', () => {
    const p = period(1)
    const records: AttendanceRecordInput[] = [
      { subjectId: p.subjectId as number, date: p.date, period: p.period, status: 'absent', slotId: p.slotId },
    ]
    const r = resolveDayPeriods(params({ scheduledPeriods: [p], records, nowMinutes: 900 }))
    expect(r[0].effectiveStatus).toBe('absent')
    expect(r[0].explicit).toBe(true)
  })

  it('keeps an explicit PRESENT as an explicit present', () => {
    const p = period(1)
    const records: AttendanceRecordInput[] = [
      { subjectId: p.subjectId as number, date: p.date, period: p.period, status: 'present', slotId: p.slotId },
    ]
    const r = resolveDayPeriods(params({ scheduledPeriods: [p], records, nowMinutes: 900 }))
    expect(r[0].effectiveStatus).toBe('present')
    expect(r[0].explicit).toBe(true)
  })

  it('omits lunch / free slots (subjectId null)', () => {
    const lunch: ScheduledPeriod = { date: TODAY, day: 'thu', period: 4, subjectId: null, type: 'lunch', slotId: 500 }
    const r = resolveDayPeriods(params({ scheduledPeriods: [lunch, period(1)], nowMinutes: 900 }))
    expect(r).toHaveLength(1)
    expect(r[0].subjectId).toBe(101)
  })
})

describe('autoPresentRecords', () => {
  it('emits present records only for auto_present slots, carrying slotId', () => {
    const recs = autoPresentRecords(params({
      scheduledPeriods: [period(1), period(5)], // P1 over, P5 upcoming at now=720
      nowMinutes: 720,
    }))
    expect(recs).toHaveLength(1)
    expect(recs[0]).toEqual({ subjectId: 101, date: TODAY, period: 1, status: 'present', slotId: 901 })
  })

  it('never emits a record for a slot that already has an explicit one', () => {
    const p = period(1)
    const records: AttendanceRecordInput[] = [
      { subjectId: p.subjectId as number, date: p.date, period: p.period, status: 'absent', slotId: p.slotId },
    ]
    const recs = autoPresentRecords(params({ scheduledPeriods: [p], records, nowMinutes: 900 }))
    expect(recs).toEqual([])
  })
})

describe('minutesSinceMidnight', () => {
  it('converts a local time to minutes-of-day', () => {
    const d = new Date(2026, 6, 16, 13, 30, 0)
    expect(minutesSinceMidnight(d)).toBe(810)
  })
})

describe('buildPeriodEndMinutesForDay', () => {
  const slots: PeriodTimeSlot[] = [
    { day: 'thu', period: 1, endTime: '09:50' },
    { day: 'thu', period: 2, endTime: '10:40' },
    { day: 'fri', period: 1, endTime: '09:45' },
    { day: 'thu', period: 3, endTime: null },
  ]

  it('maps period -> end minute for the given weekday only', () => {
    const map = buildPeriodEndMinutesForDay(slots, 'thu')
    expect(map.get(1)).toBe(590)
    expect(map.get(2)).toBe(640)
    expect(map.has(3)).toBe(false)
    expect(map.has(4)).toBe(false)
  })

  it('omits periods on a different weekday', () => {
    const map = buildPeriodEndMinutesForDay(slots, 'fri')
    expect(map.get(1)).toBe(585)
    expect(map.has(2)).toBe(false)
  })
})
