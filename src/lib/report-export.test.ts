import { describe, it, expect } from 'vitest'
import { buildCsv, buildExcelBuffer, buildPdfBuffer, buildSubjectRows, type ReportData } from './report-export'
import type { SubjectAttendance } from './attendance-engine'

const SAMPLE_DATA: ReportData = {
  generatedAt: '2026-07-16T00:00:00.000Z',
  semester: '2026-1',
  overallMinTarget: 75,
  overall: { total: 20, attended: 15, percentage: 75 },
  subjects: [
    { name: 'Data Structures', total: 12, attended: 9, percentage: 75, safeBunks: 0 },
    { name: 'Say "Hi", Bob', total: 8, attended: 6, percentage: 75, safeBunks: 0 },
  ],
  attendanceHistory: [
    { date: '2026-06-01', subject: 'Data Structures', period: 1, status: 'present', source: 'manual' },
    { date: '2026-06-02', subject: 'Data Structures', period: 1, status: 'absent', source: 'manual' },
  ],
  leaveHistory: [{ label: 'Trip', dates: '2026-06-15 – 2026-06-16 (2 days)', status: 'taken' }],
}

describe('buildSubjectRows', () => {
  it('joins subjects with their computed stats and safe-bunk count, using the default subject target', () => {
    const bySubject = new Map<number, SubjectAttendance>([
      [1, { subjectId: 1, overall: { total: 12, attended: 9, percentage: 75 }, classWork: { total: 12, attended: 9, percentage: 75 }, projectWork: { total: 0, attended: 0, percentage: null } }],
    ])
    const rows = buildSubjectRows(
      [
        { id: 1, name: 'Data Structures', customMinTarget: null },
        { id: 2, name: 'No Data Yet', customMinTarget: null },
      ],
      bySubject,
      75,
    )

    expect(rows[0]).toEqual({ name: 'Data Structures', total: 12, attended: 9, percentage: 75, safeBunks: 0 })
    expect(rows[1]).toEqual({ name: 'No Data Yet', total: 0, attended: 0, percentage: null, safeBunks: 0 })
  })

  it("uses a subject's override instead of the default when computing safe bunks", () => {
    const bySubject = new Map<number, SubjectAttendance>([
      // 9/12 = 75%: 0 safe bunks against a 75% default (floor(9*100/75)-12 = 0),
      // but 3 against a 60% override (floor(9*100/60)-12 = 15-12 = 3).
      [1, { subjectId: 1, overall: { total: 12, attended: 9, percentage: 75 }, classWork: { total: 12, attended: 9, percentage: 75 }, projectWork: { total: 0, attended: 0, percentage: null } }],
    ])
    const defaultRows = buildSubjectRows([{ id: 1, name: 'Data Structures', customMinTarget: null }], bySubject, 75)
    const overriddenRows = buildSubjectRows([{ id: 1, name: 'Data Structures', customMinTarget: 60 }], bySubject, 75)

    expect(defaultRows[0].safeBunks).toBe(0)
    expect(overriddenRows[0].safeBunks).toBe(3)
  })
})

describe('buildCsv', () => {
  it('produces a CSV with all four sections and escapes embedded quotes/commas', () => {
    const csv = buildCsv(SAMPLE_DATA)

    expect(csv).toContain('Overall')
    expect(csv).toContain('Subject-wise attendance')
    expect(csv).toContain('Attendance history')
    expect(csv).toContain('Leave history')
    expect(csv).toContain('Data Structures')
    // a comma-containing, quote-containing value must be quoted and its quotes doubled
    expect(csv).toContain('"Say ""Hi"", Bob"')
  })
})

describe('buildExcelBuffer', () => {
  it('produces a non-empty, valid xlsx (zip-format) buffer', async () => {
    const buffer = await buildExcelBuffer(SAMPLE_DATA)
    expect(buffer.byteLength).toBeGreaterThan(0)

    // xlsx files are zip archives - "PK" magic bytes confirm a real archive
    // was written, not an empty or corrupt buffer.
    const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 2))
    expect(header).toBe('PK')
  })
})

describe('buildPdfBuffer', () => {
  it('produces a non-empty PDF buffer with a valid header', async () => {
    const buffer = await buildPdfBuffer(SAMPLE_DATA)
    expect(buffer.byteLength).toBeGreaterThan(0)

    const header = new TextDecoder().decode(new Uint8Array(buffer).slice(0, 5))
    expect(header).toBe('%PDF-')
  })
})
