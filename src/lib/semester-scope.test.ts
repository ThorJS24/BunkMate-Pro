import { describe, it, expect } from 'vitest'
import { scopeRecordsToSubjects } from './semester-scope'

describe('scopeRecordsToSubjects', () => {
  it('keeps only records whose subjectId is in the given set', () => {
    const records = [{ subjectId: 1, v: 'a' }, { subjectId: 2, v: 'b' }, { subjectId: 3, v: 'c' }]
    expect(scopeRecordsToSubjects(records, [1, 3])).toEqual([{ subjectId: 1, v: 'a' }, { subjectId: 3, v: 'c' }])
  })

  it('returns nothing when the subject set is empty (e.g. no semester selected yet)', () => {
    expect(scopeRecordsToSubjects([{ subjectId: 1 }], [])).toEqual([])
  })

  it("doesn't let one semester's subjects leak into another's scoped list", () => {
    const allRecords = [{ subjectId: 10 }, { subjectId: 20 }, { subjectId: 30 }]
    const semesterASubjectIds = [10, 20]
    const semesterBSubjectIds = [30]
    expect(scopeRecordsToSubjects(allRecords, semesterASubjectIds)).toHaveLength(2)
    expect(scopeRecordsToSubjects(allRecords, semesterBSubjectIds)).toHaveLength(1)
  })
})
