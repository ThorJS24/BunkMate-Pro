import { describe, it, expect } from 'vitest'
import { getPeriodDisplayLabel, getShortPeriodDisplayLabel } from './period-display'

describe('period-display', () => {
  it('formats periods correctly when lunch is period 5', () => {
    const lunchPeriod = 5
    expect(getPeriodDisplayLabel(1, lunchPeriod)).toBe('Period 1')
    expect(getPeriodDisplayLabel(4, lunchPeriod)).toBe('Period 4')
    expect(getPeriodDisplayLabel(5, lunchPeriod)).toBe('🍱 Lunch Break')
    expect(getPeriodDisplayLabel(6, lunchPeriod)).toBe('Period 5')
    expect(getPeriodDisplayLabel(7, lunchPeriod)).toBe('Period 6')
  })

  it('formats short period labels correctly', () => {
    const lunchPeriod = 5
    expect(getShortPeriodDisplayLabel(1, lunchPeriod)).toBe('P1')
    expect(getShortPeriodDisplayLabel(5, lunchPeriod)).toBe('Lunch')
    expect(getShortPeriodDisplayLabel(6, lunchPeriod)).toBe('P5')
  })

  it('handles null or missing lunchPeriod gracefully', () => {
    expect(getPeriodDisplayLabel(5, null)).toBe('Period 5')
    expect(getShortPeriodDisplayLabel(5, undefined)).toBe('P5')
  })
})
