import { describe, expect, it } from 'vitest'
import { calculateSgpa, calculateCgpa, letterForPoints } from './gpa'

describe('calculateSgpa', () => {
  it('returns null when no subject is graded yet', () => {
    expect(calculateSgpa([{ credits: 4, gradePoint: null }])).toBeNull()
  })

  it('ignores ungraded subjects but averages the rest', () => {
    // (9*4 + 8*3) / (4+3) = 60/7
    const sgpa = calculateSgpa([
      { credits: 4, gradePoint: 9 },
      { credits: 3, gradePoint: 8 },
      { credits: 4, gradePoint: null },
    ])
    expect(sgpa).toBeCloseTo(60 / 7, 5)
  })

  it('weights by credits, not a plain average', () => {
    // A 1-credit F shouldn't drag down a 4-credit O as much as a plain mean would.
    const sgpa = calculateSgpa([
      { credits: 4, gradePoint: 10 },
      { credits: 1, gradePoint: 0 },
    ])
    expect(sgpa).toBeCloseTo(40 / 5, 5)
  })
})

describe('calculateCgpa', () => {
  it('returns null with no semesters', () => {
    expect(calculateCgpa([])).toBeNull()
  })

  it('weights semesters by their total credits', () => {
    const cgpa = calculateCgpa([
      { sgpa: 9, totalCredits: 20 },
      { sgpa: 7, totalCredits: 10 },
    ])
    expect(cgpa).toBeCloseTo((9 * 20 + 7 * 10) / 30, 5)
  })
})

describe('letterForPoints', () => {
  it('maps a known point value to its letter', () => {
    expect(letterForPoints(10)).toBe('O')
    expect(letterForPoints(0)).toBe('F')
  })

  it('returns null for a point value not on the scale', () => {
    expect(letterForPoints(3)).toBeNull()
  })
})
