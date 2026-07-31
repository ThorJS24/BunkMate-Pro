import { describe, it, expect } from 'vitest'
import { computeWeekShape, type WeekShapeSlot } from './timetable-week-shape'

function s(day: WeekShapeSlot['day'], period: number, type: string): WeekShapeSlot {
  return { day, period, type }
}

describe('computeWeekShape', () => {
  it('returns all six days with zero counts and no lightest/heaviest when there are no slots', () => {
    const shape = computeWeekShape({ slots: [], periodTimes: [] })
    expect(shape.days.map((d) => d.day)).toEqual(['mon', 'tue', 'wed', 'thu', 'fri', 'sat'])
    expect(shape.days.every((d) => d.teachingCount === 0 && d.totalMinutes === 0)).toBe(true)
    expect(shape.lightestDay).toBeNull()
    expect(shape.heaviestDay).toBeNull()
  })

  it('counts teaching periods, excluding lunch and meeting', () => {
    const slots = [s('mon', 1, 'class'), s('mon', 2, 'class'), s('mon', 3, 'lunch'), s('mon', 4, 'meeting')]
    const shape = computeWeekShape({ slots, periodTimes: [] })
    const mon = shape.days.find((d) => d.day === 'mon')!
    expect(mon.teachingCount).toBe(2)
    expect(mon.lunchPeriods).toEqual([3])
  })

  it('sums allocated minutes when every teaching period on the day has a time', () => {
    const slots = [s('mon', 1, 'class'), s('mon', 2, 'class')]
    const periodTimes = [
      { period: 1, startTime: '09:00', endTime: '10:00' },
      { period: 2, startTime: '10:00', endTime: '10:57' },
    ]
    const shape = computeWeekShape({ slots, periodTimes })
    expect(shape.days.find((d) => d.day === 'mon')!.totalMinutes).toBe(60 + 57)
  })

  it('falls back to null minutes (not a partial sum) when any teaching period lacks a time', () => {
    const slots = [s('mon', 1, 'class'), s('mon', 2, 'class')]
    const periodTimes = [{ period: 1, startTime: '09:00', endTime: '10:00' }] // period 2 missing
    const shape = computeWeekShape({ slots, periodTimes })
    expect(shape.days.find((d) => d.day === 'mon')!.totalMinutes).toBeNull()
  })

  it('identifies the lightest and heaviest teaching days when counts differ', () => {
    const slots = [
      s('mon', 1, 'class'),
      s('tue', 1, 'class'), s('tue', 2, 'class'), s('tue', 3, 'class'),
      s('wed', 1, 'class'), s('wed', 2, 'class'),
    ]
    const shape = computeWeekShape({ slots, periodTimes: [] })
    expect(shape.lightestDay).toBe('mon')
    expect(shape.heaviestDay).toBe('tue')
  })

  it('reports no lightest/heaviest when every teaching day is tied', () => {
    const slots = [s('mon', 1, 'class'), s('tue', 1, 'class'), s('wed', 1, 'class')]
    const shape = computeWeekShape({ slots, periodTimes: [] })
    expect(shape.lightestDay).toBeNull()
    expect(shape.heaviestDay).toBeNull()
  })

  it('ignores days with zero teaching periods when finding lightest/heaviest', () => {
    // Only Monday has any teaching at all — a single day can't be both
    // lightest and heaviest in a meaningful sense, so neither is set.
    const slots = [s('mon', 1, 'class'), s('mon', 4, 'lunch')]
    const shape = computeWeekShape({ slots, periodTimes: [] })
    expect(shape.lightestDay).toBeNull()
    expect(shape.heaviestDay).toBeNull()
  })
})
