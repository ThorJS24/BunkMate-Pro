// Parses the plain text extracted from a digital (text-selectable) exam
// hall-ticket PDF into a set of DRAFT exams the user reviews and edits before
// saving. Deliberately best-effort and permissive: every row is editable in
// the UI, so over-matching a date is cheaper than missing one. Pure + no
// Electron/DOM deps so it can be unit-tested against extracted text.

export interface HallTicketDraftRow {
  /** Best-guess exam name (course title, falling back to the code or line). */
  name: string
  /** Matched subject id, or null when nothing matched confidently. */
  subjectId: number | null
  /** ISO yyyy-mm-dd. */
  date: string
  /** Course/paper code as printed, e.g. "MA231". Null when not found. */
  courseCode: string | null
  /** Exam start time as "HH:MM" (24h), or null. */
  startTime: string | null
  /** The earlier "be seated by" time as "HH:MM" (24h), or null. */
  reportingTime: string | null
  /** Venue text, e.g. "BLOCK II Floor:FIRST Room:K224". Null when not found. */
  location: string | null
  /** The original source line, kept for display/debugging in the draft. */
  source: string
}

interface SubjectLike {
  id: number
  name: string
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

// Lines whose date is obviously not an exam date — issue/print/birth dates.
const NON_EXAM_DATE_LINE = /\b(date of (issue|print|printing)|printed on|generated on|issued on|d\.?o\.?b|date of birth|valid (up)?to)\b/i

// Lines that carry a date but frame the printout rather than an exam: the
// portal URL header and the "generated ... IST" footer top-and-tail the page.
const NON_EXAM_LINE = /https?:|christuniversity|knowledgepro|method=|\.do\b|\bIST\b/i

// A course-code token like CSE731, MCA502A, 21MDS131.
const COURSE_CODE = /\b(\d{0,2}[A-Z]{2,4}\d{2,4}[A-Z]?)\b/

// A clock time with an optional meridiem: "09:15 AM", "2:00PM", "14:30".
const TIME_TOKEN = /\b(\d{1,2}):(\d{2})\s*(?:([AaPp])\.?[Mm]?\.?)?/g
// Words that mark a fragment as venue text rather than noise. OCR often wraps a
// long venue onto the next line, which we stitch back on using these.
const VENUE_HINT = /\b(block|room|floor|hall|lab|seat|centre|center)\b/i

/** Converts a parsed clock time to "HH:MM" 24h, or null if implausible. */
function normalizeTime(hour: number, minute: number, meridiem: string | undefined): string | null {
  if (minute > 59 || hour > 23) return null
  let h = hour
  if (meridiem) {
    const isPm = meridiem.toLowerCase() === 'p'
    if (h === 12) h = isPm ? 12 : 0
    else if (isPm) h += 12
  }
  if (h > 23) return null
  return `${pad(h)}:${pad(minute)}`
}

/** Pulls every clock time out of a fragment, in order of appearance. */
function findTimes(text: string): string[] {
  const out: string[] = []
  for (const m of text.matchAll(TIME_TOKEN)) {
    const t = normalizeTime(Number(m[1]), Number(m[2]), m[3])
    if (t) out.push(t)
  }
  return out
}

/**
 * Cleans a fragment down to venue text (times/meridiems/noise removed). Returns
 * null unless the result actually names a venue — the scanned page is full of
 * OCR noise ("© uF Loa") that would otherwise be stored as a location.
 */
function extractLocation(fragment: string): string | null {
  const s = fragment
    .replace(TIME_TOKEN, ' ')
    .replace(/\b[AaPp]\.?[Mm]\.?\b/g, ' ')
    .replace(/[|·•\t"“”]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
    .trim()
  if (s.length < 3 || !VENUE_HINT.test(s)) return null
  return s
}

/**
 * Whether a date-less line looks like the tail of a wrapped venue rather than
 * page prose. The instructions ("1. Report to the Examination Hall before…")
 * mention "hall", so a venue word alone isn't enough — real venue fragments are
 * short and aren't numbered list items.
 */
function isVenueContinuation(line: string): boolean {
  return VENUE_HINT.test(line) && line.length <= 60 && !/^\d+\s*[.)]/.test(line)
}

interface FoundDate {
  iso: string
  match: string
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function isValidYmd(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  if (y < 1900 || y > 2100) return false
  return true
}

function fourDigitYear(y: number): number {
  return y < 100 ? 2000 + y : y
}

/** Finds the first plausible date on a line and returns it in ISO form. */
export function findDate(line: string): FoundDate | null {
  // 1. ISO-ish yyyy-mm-dd (4-digit lead) — unambiguous, try first.
  let m = line.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/)
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
    if (isValidYmd(y, mo, d)) return { iso: `${y}-${pad(mo)}-${pad(d)}`, match: m[0] }
  }

  // 2. "19 Dec 2026" / "19 December 2026" (day month-name year).
  m = line.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/)
  if (m) {
    const mo = MONTHS[m[2].toLowerCase().slice(0, m[2].length >= 4 ? 4 : 3)] ?? MONTHS[m[2].toLowerCase().slice(0, 3)]
    const y = Number(m[3]), d = Number(m[1])
    if (mo && isValidYmd(y, mo, d)) return { iso: `${y}-${pad(mo)}-${pad(d)}`, match: m[0] }
  }

  // 3. "Dec 19, 2026" (month-name day year).
  m = line.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})\b/)
  if (m) {
    const mo = MONTHS[m[1].toLowerCase().slice(0, 3)]
    const y = Number(m[3]), d = Number(m[2])
    if (mo && isValidYmd(y, mo, d)) return { iso: `${y}-${pad(mo)}-${pad(d)}`, match: m[0] }
  }

  // 4. Numeric day-first d-m-y / d/m/y / d.m.y (Indian convention).
  m = line.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/)
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]), y = fourDigitYear(Number(m[3]))
    if (isValidYmd(y, mo, d)) return { iso: `${y}-${pad(mo)}-${pad(d)}`, match: m[0] }
  }

  return null
}

function extractName(line: string, dateMatch: string, code: string | null): string {
  // On a hall-ticket row the layout is "<code> <course name> <date> <times>
  // <venue>", so the course name is the text between the code and the date.
  // Taking everything before the date drops the trailing times/venue cleanly.
  const dateStart = line.indexOf(dateMatch)
  let name = dateStart > 0 ? line.slice(0, dateStart) : line.replace(dateMatch, ' ')
  if (code) name = name.replace(code, ' ')
  // Strip any stray time tokens like "10:00 AM", "2:00PM", "14:30".
  name = name.replace(/\b\d{1,2}:\d{2}\s*(?:[AaPp]\.?[Mm]\.?)?/g, ' ')
  // Strip common table noise and separators.
  name = name.replace(/\b(session|forenoon|afternoon|reporting|exam\s*time|slot|shift)\b/gi, ' ')
  name = name.replace(/[|·•\t]+/g, ' ').replace(/\s{2,}/g, ' ').replace(/^[\s\-–—:.]+|[\s\-–—:.]+$/g, '')
  return name.trim()
}

function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

function matchSubjectId(line: string, code: string | null, subjects: SubjectLike[]): number | null {
  const lc = line.toLowerCase()

  // 1. Course code appearing inside a subject's name (e.g. "Data Engineering (CSE731)").
  if (code) {
    const byCode = subjects.find((s) => s.name.toLowerCase().includes(code.toLowerCase()))
    if (byCode) return byCode.id
  }

  // 2. A subject's full name appearing in the line — prefer the longest match.
  let best: SubjectLike | null = null
  let bestLen = 0
  for (const s of subjects) {
    const n = normalizeName(s.name)
    if (n.length >= 3 && normalizeName(line).includes(n) && n.length > bestLen) {
      best = s
      bestLen = n.length
    }
  }
  if (best) return best.id

  // 3. Token overlap: most of the subject's significant words appear in the line.
  const lineTokens = new Set(normalizeName(lc).split(' ').filter((t) => t.length >= 4))
  let bestScore = 0
  for (const s of subjects) {
    const words = normalizeName(s.name).split(' ').filter((t) => t.length >= 4)
    if (words.length === 0) continue
    const hit = words.filter((w) => lineTokens.has(w)).length
    const ratio = hit / words.length
    if (hit >= 2 && ratio >= 0.6 && hit > bestScore) {
      best = s
      bestScore = hit
    }
  }
  return best ? best.id : null
}

/**
 * Parses extracted hall-ticket text into draft exam rows. One row per line
 * that carries a plausible exam date; header/footer date lines are skipped.
 * Results are de-duplicated on (date + normalized name).
 */
export function parseHallTicket(text: string, subjects: SubjectLike[]): HallTicketDraftRow[] {
  const rows: HallTicketDraftRow[] = []
  const seen = new Set<string>()

  // The row a wrapped venue fragment would belong to (OCR often splits a long
  // venue onto the following line).
  let lastRow: HallTicketDraftRow | null = null

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (line.length === 0) continue
    if (NON_EXAM_DATE_LINE.test(line) || NON_EXAM_LINE.test(line)) {
      lastRow = null
      continue
    }

    const found = findDate(line)
    if (!found) {
      // No date: possibly the tail of the previous row's venue. Stitch at most
      // ONE such line per row — the page has loose venue fragments scattered
      // between rows, and appending them all produced runaway duplicated text.
      if (lastRow && isVenueContinuation(line)) {
        const extra = extractLocation(line)
        if (extra && !(lastRow.location ?? '').includes(extra)) {
          lastRow.location = lastRow.location ? `${lastRow.location} ${extra}` : extra
        }
        lastRow = null
      }
      continue
    }

    const codeMatch = line.match(COURSE_CODE)
    const code = codeMatch ? codeMatch[1] : null
    const subjectId = matchSubjectId(line, code, subjects)

    let name = extractName(line, found.match, code)
    if (name.length < 2) name = code ?? 'Exam'

    // Everything after the date holds the times and the venue.
    const dateStart = line.indexOf(found.match)
    const tail = dateStart >= 0 ? line.slice(dateStart + found.match.length) : ''
    // Hall-ticket column order is Reporting Time then Exam Time, so map by
    // position; a row where OCR only caught one time leaves the other null
    // rather than guessing (the draft is editable).
    const times = findTimes(tail)
    const reportingTime = times[0] ?? null
    const startTime = times[1] ?? null

    const key = `${found.iso}::${normalizeName(name)}`
    if (seen.has(key)) continue
    seen.add(key)

    const row: HallTicketDraftRow = {
      name,
      subjectId,
      date: found.iso,
      courseCode: code,
      startTime,
      reportingTime,
      location: extractLocation(tail),
      source: line,
    }
    rows.push(row)
    lastRow = row
  }

  // Chronological order for review.
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  return rows
}
