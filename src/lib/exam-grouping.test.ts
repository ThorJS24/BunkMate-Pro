import { describe, it, expect } from 'vitest'
import { groupExams, UNGROUPED } from './exam-grouping'

const exam = (semester: string, examGroup: string | null, date: string) => ({ semester, examGroup, date })

describe('groupExams', () => {
  it('nests semester > group > exams', () => {
    const tree = groupExams([
      exam('2024-2', 'End Semester', '2024-11-15'),
      exam('2024-2', 'End Semester', '2024-11-17'),
      exam('2024-1', 'CIA I - Component 1', '2024-02-10'),
    ])
    expect(tree.map((s) => s.semester)).toEqual(['2024-2', '2024-1']) // newest first
    expect(tree[0].total).toBe(2)
    expect(tree[0].groups[0].name).toBe('End Semester')
    expect(tree[0].groups[0].exams.map((e) => e.date)).toEqual(['2024-11-15', '2024-11-17'])
  })

  // The whole reason this isn't alphabetical: the real sitting names sort into
  // the wrong academic order.
  it('orders sittings by when they happen, not alphabetically', () => {
    const [sem] = groupExams([
      exam('2024-2', 'End Semester', '2024-11-20'),
      exam('2024-2', 'CIA I - Component 1', '2024-08-05'),
      exam('2024-2', 'Mid Semester', '2024-09-15'),
      exam('2024-2', 'CIA III - Component 1', '2024-10-10'),
    ])
    expect(sem.groups.map((g) => g.name)).toEqual([
      'CIA I - Component 1',
      'Mid Semester',
      'CIA III - Component 1',
      'End Semester',
    ])
  })

  it('keeps the two components of one CIA adjacent and in date order', () => {
    const [sem] = groupExams([
      exam('2024-2', 'CIA I - Component 2', '2024-08-09'),
      exam('2024-2', 'CIA I - Component 1', '2024-08-05'),
      exam('2024-2', 'End Semester', '2024-11-20'),
    ])
    expect(sem.groups.map((g) => g.name)).toEqual(['CIA I - Component 1', 'CIA I - Component 2', 'End Semester'])
  })

  it('separates the same sitting name across different semesters', () => {
    const tree = groupExams([
      exam('2024-2', 'Mid Semester', '2024-09-15'),
      exam('2024-1', 'Mid Semester', '2024-02-15'),
    ])
    expect(tree).toHaveLength(2)
    expect(tree[0].groups[0].exams).toHaveLength(1)
    expect(tree[1].groups[0].exams).toHaveLength(1)
  })

  it('puts ungrouped exams last regardless of date', () => {
    const [sem] = groupExams([
      exam('2024-2', null, '2024-01-01'), // earliest, but ungrouped
      exam('2024-2', 'End Semester', '2024-11-20'),
    ])
    expect(sem.groups.map((g) => g.name)).toEqual(['End Semester', UNGROUPED])
  })

  it('returns nothing for no exams', () => {
    expect(groupExams([])).toEqual([])
  })
})
