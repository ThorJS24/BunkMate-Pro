// Nests exams for the Exams page: semester > exam group ("sitting") > exams.
// Pure so the ordering rules are testable without rendering the page.

/** The minimum an exam needs to be groupable. */
export interface GroupableExam {
  semester: string
  examGroup: string | null
  date: string
}

/** Heading used for exams with no group set; always sorted last. */
export const UNGROUPED = 'Ungrouped'

export interface ExamGroupNode<T> {
  name: string
  exams: T[]
}

export interface ExamSemesterNode<T> {
  semester: string
  total: number
  groups: ExamGroupNode<T>[]
}

/**
 * Groups by semester (newest label first), then by exam group. Groups are
 * ordered by when they actually happen — the earliest exam in each — rather
 * than alphabetically, because the real sitting names don't sort into academic
 * order ("End Semester" would come before "Mid Semester", and CIA III after
 * both). Exams inside a group run earliest-first. Ungrouped is always last.
 */
export function groupExams<T extends GroupableExam>(exams: T[]): ExamSemesterNode<T>[] {
  const bySemester = new Map<string, Map<string, T[]>>()
  for (const exam of exams) {
    const semester = exam.semester?.trim() || 'Unassigned'
    const group = exam.examGroup?.trim() || UNGROUPED
    let groups = bySemester.get(semester)
    if (!groups) {
      groups = new Map()
      bySemester.set(semester, groups)
    }
    const list = groups.get(group)
    if (list) list.push(exam)
    else groups.set(group, [exam])
  }

  const earliest = (list: T[]) => list.reduce((min, e) => (e.date < min ? e.date : min), list[0].date)

  return [...bySemester.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0))
    .map(([semester, groups]) => ({
      semester,
      total: [...groups.values()].reduce((n, list) => n + list.length, 0),
      groups: [...groups.entries()]
        .sort((a, b) => {
          if (a[0] === UNGROUPED) return 1
          if (b[0] === UNGROUPED) return -1
          const da = earliest(a[1])
          const db = earliest(b[1])
          if (da !== db) return da < db ? -1 : 1
          return a[0].localeCompare(b[0])
        })
        .map(([name, list]) => ({
          name,
          exams: [...list].sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0)),
        })),
    }))
}
