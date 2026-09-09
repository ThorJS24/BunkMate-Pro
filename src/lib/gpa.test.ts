import { describe, expect, it } from 'vitest'
import { calculateSgpa, calculateCgpa, letterForPoints, toFourPointScale, calculateRequiredSgpa } from './gpa'

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

describe('calculateRequiredSgpa', () => {
  it('needs the target itself when nothing is graded yet', () => {
    const result = calculateRequiredSgpa({ targetCgpa: 8.5, cgpaSoFar: null, creditsSoFar: 0, nextSemesterCredits: 20 })
    expect(result.requiredSgpa).toBeCloseTo(8.5, 5)
    expect(result.unreachable).toBe(false)
  })

  it('solves algebraically against prior credit-weighted CGPA', () => {
    // (8*40 + x*20) / 60 = 8.5  =>  x = (8.5*60 - 320) / 20 = 9.5
    const result = calculateRequiredSgpa({ targetCgpa: 8.5, cgpaSoFar: 8, creditsSoFar: 40, nextSemesterCredits: 20 })
    expect(result.requiredSgpa).toBeCloseTo(9.5, 5)
  })

  it('flags a target that is not reachable this semester (would need over 10)', () => {
    const result = calculateRequiredSgpa({ targetCgpa: 9.5, cgpaSoFar: 6, creditsSoFar: 80, nextSemesterCredits: 20 })
    expect(result.unreachable).toBe(true)
    expect(result.requiredSgpa).toBeGreaterThan(10)
  })

  it('returns null with no next-semester credits to solve against', () => {
    const result = calculateRequiredSgpa({ targetCgpa: 8.5, cgpaSoFar: 8, creditsSoFar: 40, nextSemesterCredits: 0 })
    expect(result.requiredSgpa).toBeNull()
  })
})

describe('toFourPointScale', () => {
  it('maps every 10-point grade to its published 4-point equivalent', () => {
    expect(toFourPointScale(10)).toBe(4)
    expect(toFourPointScale(9)).toBe(3.6)
    expect(toFourPointScale(8)).toBe(3.2)
    expect(toFourPointScale(7)).toBe(2.8)
    expect(toFourPointScale(6)).toBe(2.4)
    expect(toFourPointScale(5)).toBe(2)
    expect(toFourPointScale(4)).toBe(1.6)
    expect(toFourPointScale(0)).toBe(0)
  })

  it('returns null for a point value not on the scale', () => {
    expect(toFourPointScale(3)).toBeNull()
  })
})
