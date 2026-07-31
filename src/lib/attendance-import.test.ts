import { describe, it, expect } from 'vitest'
import { parseAttendanceCsv, reconcileImport, reconcileKey } from './attendance-import'

describe('parseAttendanceCsv', () => {
  it('parses rows and skips a header', () => {
    const csv = `date,subject,period,status
2026-03-02,Data Structures,1,present
2026-03-02,Operating Systems,2,absent`
    const { rows, errors } = parseAttendanceCsv(csv)
    expect(errors).toEqual([])
    expect(rows).toEqual([
      { rowNumber: 2, date: '2026-03-02', subjectName: 'Data Structures', period: 1, status: 'present' },
      { rowNumber: 3, date: '2026-03-02', subjectName: 'Operating Systems', period: 2, status: 'absent' },
    ])
  })

  it('works without a header row (first line is data)', () => {
    const { rows } = parseAttendanceCsv('2026-03-02,DS,1,present')
    expect(rows).toHaveLength(1)
    expect(rows[0].subjectName).toBe('DS')
  })

  it('honors quoted subject names containing commas', () => {
    const { rows } = parseAttendanceCsv('2026-03-02,"Math, Applied",1,present')
    expect(rows[0].subjectName).toBe('Math, Applied')
  })

  it('collects errors per row without dropping the whole file', () => {
    const csv = `2026-03-02,DS,1,present
not-a-date,DS,1,present
2026-03-03,DS,x,present
2026-03-04,DS,1,maybe`
    const { rows, errors } = parseAttendanceCsv(csv)
    expect(rows).toHaveLength(1)
    expect(errors.map((e) => e.rowNumber)).toEqual([2, 3, 4])
    expect(errors[0].message).toMatch(/Invalid date/)
    expect(errors[1].message).toMatch(/Invalid period/)
    expect(errors[2].message).toMatch(/Invalid status/)
  })

  it('normalizes status casing', () => {
    const { rows } = parseAttendanceCsv('2026-03-02,DS,1,PRESENT')
    expect(rows[0].status).toBe('present')
  })
})

describe('reconcileImport', () => {
  const subjectIdByName = new Map([['data structures', 10], ['operating systems', 20]])

  it('classifies create / update / unchanged / unmatched', () => {
    const existingStatusByKey = new Map<string, 'present' | 'absent'>([
      [reconcileKey(10, '2026-03-02', 1), 'absent'], // will be updated to present
      [reconcileKey(10, '2026-03-03', 1), 'present'], // unchanged
    ])
    const rows = parseAttendanceCsv(
      `2026-03-02,Data Structures,1,present
2026-03-03,Data Structures,1,present
2026-03-04,Operating Systems,2,absent
2026-03-05,Quantum Computing,1,present`,
    ).rows

    const { entries, counts } = reconcileImport({ rows, subjectIdByName, existingStatusByKey })
    expect(counts).toEqual({ create: 1, update: 1, unchanged: 1, unmatched: 1 })

    const byName = (name: string) => entries.find((e) => e.row.subjectName === name)!
    expect(byName('Operating Systems').action).toBe('create')
    expect(byName('Quantum Computing').action).toBe('unmatched')
    const updated = entries.find((e) => e.action === 'update')!
    expect(updated.existingStatus).toBe('absent')
    expect(updated.row.status).toBe('present')
  })

  it('matches subject names case-insensitively', () => {
    const rows = parseAttendanceCsv('2026-03-02,DATA STRUCTURES,1,present').rows
    const { entries } = reconcileImport({ rows, subjectIdByName, existingStatusByKey: new Map() })
    expect(entries[0].action).toBe('create')
    expect(entries[0].subjectId).toBe(10)
  })
})
