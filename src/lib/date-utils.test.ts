import { describe, expect, it } from 'vitest'
import { monthLabelFor, groupByMonth, groupByDay } from './date-utils'

describe('monthLabelFor', () => {
  it('formats a yyyy-mm key as a readable month + year', () => {
    expect(monthLabelFor('2026-06')).toBe('June 2026')
    expect(monthLabelFor('2027-01')).toBe('January 2027')
  })
})

describe('groupByMonth', () => {
  it('buckets items by their date\'s month, most recent month first', () => {
    const items = [{ date: '2026-06-15' }, { date: '2026-07-01' }, { date: '2026-06-01' }]
    const groups = groupByMonth(items, (i) => i.date)
    expect(groups.map((g) => g.monthKey)).toEqual(['2026-07', '2026-06'])
    expect(groups[1].monthLabel).toBe('June 2026')
    expect(groups[1].items).toHaveLength(2)
  })

  it('returns an empty list for no items', () => {
    expect(groupByMonth([], (i: { date: string }) => i.date)).toEqual([])
  })
})

describe('groupByDay', () => {
  it('buckets items by exact date, most recent first', () => {
    const items = [{ date: '2026-06-01', period: 1 }, { date: '2026-06-03', period: 1 }, { date: '2026-06-01', period: 2 }]
    const groups = groupByDay(items, (i) => i.date)
    expect(groups.map((g) => g.date)).toEqual(['2026-06-03', '2026-06-01'])
    expect(groups[1].items).toHaveLength(2)
  })
})
