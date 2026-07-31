import { describe, it, expect } from 'vitest'
import { allocateEvenPeriodTimes } from './period-time-allocation'

describe('allocateEvenPeriodTimes', () => {
  it('splits an evenly-divisible span into equal-duration periods', () => {
    const result = allocateEvenPeriodTimes({ periodsPerDay: 7, dayStartTime: '09:00', dayEndTime: '16:00' })
    expect(result).toHaveLength(7)
    expect(result[0]).toEqual({ period: 1, startTime: '09:00', endTime: '10:00' })
    expect(result[5]).toEqual({ period: 6, startTime: '14:00', endTime: '15:00' })
    expect(result[6]).toEqual({ period: 7, startTime: '15:00', endTime: '16:00' })
  })

  it('is contiguous end-to-end with no gaps or overlaps', () => {
    const result = allocateEvenPeriodTimes({ periodsPerDay: 5, dayStartTime: '08:30', dayEndTime: '13:00' })
    for (let i = 1; i < result.length; i++) {
      expect(result[i].startTime).toBe(result[i - 1].endTime)
    }
    expect(result[0].startTime).toBe('08:30')
    expect(result[result.length - 1].endTime).toBe('13:00')
  })

  it('piles the whole remainder onto the last period when the span does not divide evenly', () => {
    // 09:00-15:40 = 400 minutes over 7 periods -> base 57 min (399), remainder 1 min
    const result = allocateEvenPeriodTimes({ periodsPerDay: 7, dayStartTime: '09:00', dayEndTime: '15:40' })
    expect(result).toHaveLength(7)
    for (const p of result.slice(0, -1)) {
      const [sh, sm] = p.startTime.split(':').map(Number)
      const [eh, em] = p.endTime.split(':').map(Number)
      expect(eh * 60 + em - (sh * 60 + sm)).toBe(57)
    }
    const last = result[6]
    const [sh, sm] = last.startTime.split(':').map(Number)
    const [eh, em] = last.endTime.split(':').map(Number)
    expect(eh * 60 + em - (sh * 60 + sm)).toBe(58) // 57 + 1 min remainder
    expect(last.endTime).toBe('15:40')
  })

  it('throws when the end time is not after the start time', () => {
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 7, dayStartTime: '16:00', dayEndTime: '09:00' }),
    ).toThrow(/must be after/)
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 7, dayStartTime: '09:00', dayEndTime: '09:00' }),
    ).toThrow(/must be after/)
  })

  it('throws when the span is too short to give every period at least a minute', () => {
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 10, dayStartTime: '09:00', dayEndTime: '09:05' }),
    ).toThrow(/too short/)
  })

  it('throws on a non-positive or non-integer periodsPerDay', () => {
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 0, dayStartTime: '09:00', dayEndTime: '16:00' }),
    ).toThrow(/positive integer/)
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 3.5, dayStartTime: '09:00', dayEndTime: '16:00' }),
    ).toThrow(/positive integer/)
  })

  it('throws on a malformed time string', () => {
    expect(() =>
      allocateEvenPeriodTimes({ periodsPerDay: 7, dayStartTime: '9am', dayEndTime: '16:00' }),
    ).toThrow(/Invalid time/)
  })

  it('handles a single period spanning the whole day', () => {
    const result = allocateEvenPeriodTimes({ periodsPerDay: 1, dayStartTime: '09:00', dayEndTime: '10:30' })
    expect(result).toEqual([{ period: 1, startTime: '09:00', endTime: '10:30' }])
  })
})
