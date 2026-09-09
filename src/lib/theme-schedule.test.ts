import { describe, it, expect } from 'vitest'
import { isDarkBySchedule } from './theme-schedule'

describe('isDarkBySchedule', () => {
  it('is dark inside an overnight window (19:00 -> 07:00)', () => {
    expect(isDarkBySchedule(20 * 60, '19:00', '07:00')).toBe(true) // 8pm
    expect(isDarkBySchedule(2 * 60, '19:00', '07:00')).toBe(true) // 2am
    expect(isDarkBySchedule(19 * 60, '19:00', '07:00')).toBe(true) // exactly start
  })

  it('is light outside an overnight window', () => {
    expect(isDarkBySchedule(12 * 60, '19:00', '07:00')).toBe(false) // noon
    expect(isDarkBySchedule(7 * 60, '19:00', '07:00')).toBe(false) // exactly end, exclusive
  })

  it('handles a same-day (non-wrapping) window', () => {
    expect(isDarkBySchedule(2 * 60, '01:00', '06:00')).toBe(true)
    expect(isDarkBySchedule(12 * 60, '01:00', '06:00')).toBe(false)
  })

  it('stays light when start equals end (no window)', () => {
    expect(isDarkBySchedule(10 * 60, '09:00', '09:00')).toBe(false)
  })

  it('is light for an unparseable time', () => {
    expect(isDarkBySchedule(600, 'bad', '07:00')).toBe(false)
  })
})
