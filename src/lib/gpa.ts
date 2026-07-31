// SGPA/CGPA on CHRIST's absolute 10-point scale. Pure so the credit-weighted
// averaging is testable without a running app, same split as attendance-engine.ts.

export const GRADE_SCALE = [
  { letter: 'O', points: 10 },
  { letter: 'A+', points: 9 },
  { letter: 'A', points: 8 },
  { letter: 'B+', points: 7 },
  { letter: 'B', points: 6 },
  { letter: 'C', points: 5 },
  { letter: 'P', points: 4 },
  { letter: 'F', points: 0 },
] as const

export type GradeLetter = (typeof GRADE_SCALE)[number]['letter']

export function letterForPoints(points: number): GradeLetter | null {
  return GRADE_SCALE.find((g) => g.points === points)?.letter ?? null
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
