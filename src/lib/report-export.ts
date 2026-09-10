import { computeSafeBunkCount, resolveSubjectMinTarget } from './attendance-engine'
import type { SubjectAttendance } from './attendance-engine'
import ExcelJS from 'exceljs'
import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'

export interface ReportSubjectRow {
  name: string
  total: number
  attended: number
  percentage: number | null
  safeBunks: number
}

export interface ReportAttendanceRow {
  date: string
  subject: string
  period: number
  status: string
  source: string
}

export interface ReportLeaveRow {
  label: string
  dates: string
  status: string
}

export interface ReportData {
  generatedAt: string
  semester: string
  overallMinTarget: number
  overall: { total: number; attended: number; percentage: number | null }
  subjects: ReportSubjectRow[]
  attendanceHistory: ReportAttendanceRow[]
  leaveHistory: ReportLeaveRow[]
}

export function buildSubjectRows(
  subjects: { id: number; name: string; customMinTarget: number | null }[],
  bySubject: Map<number, SubjectAttendance>,
  defaultSubjectMinTarget: number,
): ReportSubjectRow[] {
  return subjects.map((s) => {
    const stats = bySubject.get(s.id)?.overall ?? { total: 0, attended: 0, percentage: null }
    const target = resolveSubjectMinTarget(s, defaultSubjectMinTarget)
    return {
      name: s.name,
      total: stats.total,
      attended: stats.attended,
      percentage: stats.percentage,
      safeBunks: computeSafeBunkCount(stats.attended, stats.total, target),
    }
  })
}

function csvEscape(value: string | number): string {
  const str = String(value)
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str
}

function csvSection(title: string, headers: string[], rows: (string | number)[][]): string {
  const lines = [title, headers.map(csvEscape).join(',')]
  for (const row of rows) lines.push(row.map(csvEscape).join(','))
  return lines.join('\n')
}

export function buildCsv(data: ReportData): string {
  const sections = [
    csvSection('Overall', ['Total', 'Attended', 'Percentage'], [
      [data.overall.total, data.overall.attended, data.overall.percentage?.toFixed(1) ?? ''],
    ]),
    csvSection(
      'Subject-wise attendance',
      ['Subject', 'Total', 'Attended', 'Percentage', 'Safe bunks'],
      data.subjects.map((s) => [s.name, s.total, s.attended, s.percentage?.toFixed(1) ?? '', s.safeBunks]),
    ),
    csvSection(
      'Attendance history',
      ['Date', 'Subject', 'Period', 'Status', 'Source'],
      data.attendanceHistory.map((r) => [r.date, r.subject, r.period, r.status, r.source]),
    ),
    csvSection(
      'Leave history',
      ['Label', 'Dates', 'Status'],
      data.leaveHistory.map((r) => [r.label, r.dates, r.status]),
    ),
  ]
  return sections.join('\n\n')
}

export async function buildExcelBuffer(data: ReportData): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook()
  workbook.created = new Date(data.generatedAt)

  const summary = workbook.addWorksheet('Summary')
  summary.addRow(['Generated', data.generatedAt])
  summary.addRow(['Semester', data.semester])
  summary.addRow(['Overall target %', data.overallMinTarget])
  summary.addRow([])
  summary.addRow(['Overall total', 'Overall attended', 'Overall %'])
  summary.addRow([data.overall.total, data.overall.attended, data.overall.percentage?.toFixed(1) ?? ''])

  const subjectsSheet = workbook.addWorksheet('Subjects')
  subjectsSheet.addRow(['Subject', 'Total', 'Attended', 'Percentage', 'Safe bunks'])
  for (const s of data.subjects) {
    subjectsSheet.addRow([s.name, s.total, s.attended, s.percentage?.toFixed(1) ?? '', s.safeBunks])
  }

  const historySheet = workbook.addWorksheet('Attendance History')
  historySheet.addRow(['Date', 'Subject', 'Period', 'Status', 'Source'])
  for (const r of data.attendanceHistory) {
    historySheet.addRow([r.date, r.subject, r.period, r.status, r.source])
  }

  const leaveSheet = workbook.addWorksheet('Leave History')
  leaveSheet.addRow(['Label', 'Dates', 'Status'])
  for (const r of data.leaveHistory) {
    leaveSheet.addRow([r.label, r.dates, r.status])
  }

  return workbook.xlsx.writeBuffer()
}

export async function buildPdfBuffer(data: ReportData): Promise<ArrayBuffer> {
  const doc = new jsPDF()

  doc.setFontSize(16)
  doc.text('BunkMate Pro: Attendance Report', 14, 16)
  doc.setFontSize(10)
  doc.text(`Generated ${data.generatedAt} · Semester ${data.semester} · Overall target ${data.overallMinTarget}%`, 14, 22)
  doc.text(
    `Overall: ${data.overall.attended}/${data.overall.total} (${data.overall.percentage?.toFixed(1) ?? '—'}%)`,
    14,
    28,
  )

  autoTable(doc, {
    startY: 34,
    head: [['Subject', 'Total', 'Attended', 'Percentage', 'Safe bunks']],
    body: data.subjects.map((s) => [s.name, s.total, s.attended, `${s.percentage?.toFixed(1) ?? '—'}%`, s.safeBunks]),
  })

  const afterSubjects = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  doc.setFontSize(12)
  doc.text('Leave history', 14, afterSubjects)
  autoTable(doc, {
    startY: afterSubjects + 4,
    head: [['Label', 'Dates', 'Status']],
    body: data.leaveHistory.map((r) => [r.label, r.dates, r.status]),
  })

  const afterLeave = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10
  doc.text('Attendance history', 14, afterLeave)
  autoTable(doc, {
    startY: afterLeave + 4,
    head: [['Date', 'Subject', 'Period', 'Status', 'Source']],
    body: data.attendanceHistory.map((r) => [r.date, r.subject, r.period, r.status, r.source]),
  })

  return doc.output('arraybuffer')
}

/**
 * A short, single-page "proof of attendance" — deliberately NOT the same
 * document as buildPdfBuffer's full report: that one is an exhaustive
 * record dump (every marked period, leave history) meant for the student's
 * own review; this one is meant to be handed to someone else (faculty,
 * administration) as evidence of standing, so it's just the semester, the
 * generation date, and a clean per-subject status table.
 */
export async function buildAttendanceCertificatePdf(data: ReportData): Promise<ArrayBuffer> {
  const doc = new jsPDF()

  doc.setFontSize(18)
  doc.text('Attendance Certificate', 14, 20)
  doc.setFontSize(10)
  doc.setTextColor(100)
  doc.text(`Semester: ${data.semester}`, 14, 28)
  doc.text(`Generated: ${new Date(data.generatedAt).toLocaleString()}`, 14, 33)
  doc.setTextColor(0)

  doc.setFontSize(12)
  doc.text(
    `Overall attendance: ${data.overall.percentage?.toFixed(1) ?? '—'}%  (${data.overall.attended}/${data.overall.total} periods, target ${data.overallMinTarget}%)`,
    14,
    43,
  )

  autoTable(doc, {
    startY: 50,
    head: [['Subject', 'Attended', 'Total', 'Percentage', 'Meets target']],
    body: data.subjects.map((s) => [
      s.name,
      s.attended,
      s.total,
      s.percentage !== null ? `${s.percentage.toFixed(1)}%` : '—',
      s.percentage !== null && s.percentage >= data.overallMinTarget ? 'Yes' : 'No',
    ]),
    styles: { fontSize: 10 },
    headStyles: { fillColor: [40, 40, 40] },
  })

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16
  doc.setFontSize(9)
  doc.setTextColor(120)
  doc.text('Generated by BunkMate Pro from self-reported attendance records.', 14, finalY)

  return doc.output('arraybuffer')
}

export type ReportFormat = 'csv' | 'excel' | 'pdf'

export async function exportReport(data: ReportData, format: ReportFormat): Promise<string | null> {
  const baseName = `bunkmate-report-${data.generatedAt.slice(0, 10)}`
  if (format === 'csv') {
    return window.bunkmate.files.saveFile({
      defaultName: `${baseName}.csv`,
      content: buildCsv(data),
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })
  }
  if (format === 'excel') {
    const buffer = await buildExcelBuffer(data)
    return window.bunkmate.files.saveFile({
      defaultName: `${baseName}.xlsx`,
      content: buffer,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }],
    })
  }
  const buffer = await buildPdfBuffer(data)
  return window.bunkmate.files.saveFile({
    defaultName: `${baseName}.pdf`,
    content: buffer,
    filters: [{ name: 'PDF', extensions: ['pdf'] }],
  })
}
