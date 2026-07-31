// Pure parsing + reconciliation for importing attendance from a CSV. The
// reconcile step is deliberately merge-not-overwrite: it classifies each
// incoming row against what's already stored and never proposes deleting a
// local record the file doesn't mention. This is the same shape the future
// ESPRO sync will reuse — surface a diff, let the user apply it.

export interface ParsedAttendanceRow {
  rowNumber: number
  date: string
  subjectName: string
  period: number
  status: 'present' | 'absent'
}

export interface ParseError {
  rowNumber: number
  message: string
}

export interface ParseResult {
  rows: ParsedAttendanceRow[]
  errors: ParseError[]
}

// Minimal CSV line splitter that respects double-quoted fields (so a subject
// name with a comma survives). Good enough for the flat date/subject/period/
// status shape; not a general RFC-4180 parser.
function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((s) => s.trim())
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Parses a CSV with columns: date, subject, period, status. A header row is
 * detected and skipped if its first cell isn't an ISO date. Every row is
 * validated; bad rows land in `errors` (with the source line number) rather
 * than silently vanishing.
 */
export function parseAttendanceCsv(text: string): ParseResult {
  const rows: ParsedAttendanceRow[] = []
  const errors: ParseError[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trim())

  let started = false
  lines.forEach((line, i) => {
    const rowNumber = i + 1
    if (line === '') return
    const cells = splitCsvLine(line)
    // Skip a header row: first non-empty line whose first cell isn't a date.
    if (!started && !DATE_RE.test(cells[0] ?? '')) {
      started = true
      return
    }
    started = true

    if (cells.length < 4) {
      errors.push({ rowNumber, message: 'Expected 4 columns: date, subject, period, status.' })
      return
    }
    const [date, subjectName, periodStr, statusStr] = cells
    if (!DATE_RE.test(date)) {
      errors.push({ rowNumber, message: `Invalid date "${date}" (expected yyyy-mm-dd).` })
      return
    }
    if (!subjectName) {
      errors.push({ rowNumber, message: 'Missing subject.' })
      return
    }
    const period = Number(periodStr)
    if (!Number.isInteger(period) || period < 1) {
      errors.push({ rowNumber, message: `Invalid period "${periodStr}".` })
      return
    }
    const status = statusStr.toLowerCase()
    if (status !== 'present' && status !== 'absent') {
      errors.push({ rowNumber, message: `Invalid status "${statusStr}" (expected present or absent).` })
      return
    }
    rows.push({ rowNumber, date, subjectName, period, status })
  })

  return { rows, errors }
}

export type ReconcileAction = 'create' | 'update' | 'unchanged' | 'unmatched'

export interface ReconcileEntry {
  row: ParsedAttendanceRow
  action: ReconcileAction
  subjectId: number | null
  /** Present when action is 'update' or 'unchanged'. */
  existingStatus?: 'present' | 'absent'
}

export interface ReconcileResult {
  entries: ReconcileEntry[]
  counts: Record<ReconcileAction, number>
}

export function reconcileKey(subjectId: number, date: string, period: number): string {
  return `${subjectId}:${date}:${period}`
}

/**
 * Classifies each parsed row against the current data. Subject names are
 * matched case-insensitively. Never proposes deletions — rows only ever
 * create, update, no-op, or fail to match.
 */
export function reconcileImport(params: {
  rows: ParsedAttendanceRow[]
  /** lower-cased subject name -> id, for the target semester. */
  subjectIdByName: Map<string, number>
  /** reconcileKey -> current status, for existing records. */
  existingStatusByKey: Map<string, 'present' | 'absent'>
}): ReconcileResult {
  const { rows, subjectIdByName, existingStatusByKey } = params
  const counts: Record<ReconcileAction, number> = { create: 0, update: 0, unchanged: 0, unmatched: 0 }
  const entries: ReconcileEntry[] = rows.map((row) => {
    const subjectId = subjectIdByName.get(row.subjectName.toLowerCase())
    if (subjectId === undefined) {
      counts.unmatched++
      return { row, action: 'unmatched', subjectId: null }
    }
    const existing = existingStatusByKey.get(reconcileKey(subjectId, row.date, row.period))
    if (existing === undefined) {
      counts.create++
      return { row, action: 'create', subjectId }
    }
    if (existing === row.status) {
      counts.unchanged++
      return { row, action: 'unchanged', subjectId, existingStatus: existing }
    }
    counts.update++
    return { row, action: 'update', subjectId, existingStatus: existing }
  })
  return { entries, counts }
}
