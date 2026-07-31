// Maps parsed .ics events into exam draft rows, feeding the same review
// dialog the hall-ticket OCR import already uses (src/pages/exams.tsx). Kept
// separate from ics-parser.ts (generic) and exam-ics.ts (export-only) so each
// stays single-purpose.
import type { ParsedIcsEvent } from './ics-parser'

export interface SubjectLike {
  id: number
  name: string
}

export interface ExamIcsDraftRow {
  key: string
  name: string
  subjectId: number | null
  date: string
  startTime: string
  reportingTime: string
  courseCode: string
  location: string
}

// Matches exam-ics.ts's own export format ("CODE: Name") so a BunkMate
// export round-trips its course code back into a separate field; anything
// else just keeps the whole summary as the name. Also accepts the older
// " — " separator so a file exported before that format changed still
// round-trips.
const CODE_PREFIX_RE = /^([A-Za-z0-9]+)(?::| —) (.+)$/

function matchSubjectId(summary: string, subjects: SubjectLike[]): number | null {
  const lower = summary.toLowerCase()
  const exact = subjects.find((s) => s.name.toLowerCase() === lower)
  if (exact) return exact.id
  const contains = subjects.find((s) => lower.includes(s.name.toLowerCase()))
  return contains?.id ?? null
}

export function icsEventsToExamDrafts(events: ParsedIcsEvent[], subjects: SubjectLike[]): ExamIcsDraftRow[] {
  return events.map((event, i) => {
    const codeMatch = CODE_PREFIX_RE.exec(event.summary)
    const courseCode = codeMatch?.[1] ?? ''
    const name = codeMatch?.[2] ?? event.summary
    return {
      key: `ics-${i}`,
      name,
      subjectId: matchSubjectId(name, subjects),
      date: event.date,
      startTime: event.startTime ?? '',
      reportingTime: '',
      courseCode,
      location: event.location ?? '',
    }
  })
}
