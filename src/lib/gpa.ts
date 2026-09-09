// SGPA/CGPA on CHRIST's absolute grading scale. Pure so the credit-weighted
// averaging is testable without a running app, same split as attendance-engine.ts.
//
// Per the 2026-27 handbook, the University's own primary scale is actually
// 4-point, with 10-point (what students/marksheets usually talk in) as the
// secondary representation transcripts also show. `points` (10-pt) is what's
// stored per-subject (src/pages/gpa.tsx's grade Select); `points4` is its
// 4-point equivalent, matching the official table exactly (works out to
// points/2.5 throughout, but spelled out per-grade so it can't drift from
// what's published).

export const GRADE_SCALE = [
  { letter: 'O', points: 10, points4: 4 },
  { letter: 'A+', points: 9, points4: 3.6 },
  { letter: 'A', points: 8, points4: 3.2 },
  { letter: 'B+', points: 7, points4: 2.8 },
  { letter: 'B', points: 6, points4: 2.4 },
  { letter: 'C', points: 5, points4: 2 },
  { letter: 'P', points: 4, points4: 1.6 },
  { letter: 'F', points: 0, points4: 0 },
] as const

export type GradeLetter = (typeof GRADE_SCALE)[number]['letter']

export function letterForPoints(points: number): GradeLetter | null {
  return GRADE_SCALE.find((g) => g.points === points)?.letter ?? null
}

/** Maps a stored 10-point grade value to its official 4-point equivalent. */
export function toFourPointScale(points: number): number | null {
  return GRADE_SCALE.find((g) => g.points === points)?.points4 ?? null
}

export interface GradedSubject {
  credits: number
  gradePoint: number | null
}

/** Credit-weighted average over graded subjects only; null if none are graded yet. */
export function calculateSgpa(subjects: GradedSubject[]): number | null {
  const graded = subjects.filter((s): s is GradedSubject & { gradePoint: number } => s.gradePoint !== null)
  const totalCredits = graded.reduce((sum, s) => sum + s.credits, 0)
  if (totalCredits === 0) return null
  const weighted = graded.reduce((sum, s) => sum + s.gradePoint * s.credits, 0)
  return weighted / totalCredits
}

export interface SemesterGpa {
  sgpa: number
  totalCredits: number
}

/** Credit-weighted average of each semester's SGPA; null if no semester has one yet. */
export function calculateCgpa(semesters: SemesterGpa[]): number | null {
  const totalCredits = semesters.reduce((sum, s) => sum + s.totalCredits, 0)
  if (totalCredits === 0) return null
  const weighted = semesters.reduce((sum, s) => sum + s.sgpa * s.totalCredits, 0)
  return weighted / totalCredits
}

export interface RequiredSgpaResult {
  /** SGPA needed this semester to reach targetCgpa overall, given what's graded so far. Null if nextSemesterCredits is 0. */
  requiredSgpa: number | null
  /** True when requiredSgpa is above the scale's maximum (10) — the target isn't reachable this semester alone. */
  unreachable: boolean
}

/**
 * Reverse CGPA calculator: given everything graded so far (as a single
 * credit-weighted CGPA + total credits, exactly what calculateCgpa already
 * produces) and how many credits the upcoming semester carries, solves for
 * the SGPA that semester needs to land on to hit `targetCgpa` overall.
 * Algebraically: targetCgpa = (cgpaSoFar*creditsSoFar + x*nextCredits) /
 * (creditsSoFar+nextCredits), solved for x. `cgpaSoFar`/`creditsSoFar` of
 * null/0 (nothing graded yet) just means the next semester's SGPA has to
 * equal the target outright.
 */
export function calculateRequiredSgpa(params: {
  targetCgpa: number
  cgpaSoFar: number | null
  creditsSoFar: number
  nextSemesterCredits: number
}): RequiredSgpaResult {
  const { targetCgpa, cgpaSoFar, creditsSoFar, nextSemesterCredits } = params
  if (nextSemesterCredits <= 0) return { requiredSgpa: null, unreachable: false }

  const priorWeighted = (cgpaSoFar ?? 0) * creditsSoFar
  const totalCredits = creditsSoFar + nextSemesterCredits
  const requiredSgpa = (targetCgpa * totalCredits - priorWeighted) / nextSemesterCredits

  return { requiredSgpa, unreachable: requiredSgpa > 10 }
}
