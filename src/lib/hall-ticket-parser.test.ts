import { describe, it, expect } from 'vitest'
import { findDate, parseHallTicket } from './hall-ticket-parser'

describe('findDate', () => {
  it('reads dd-mm-yyyy day-first', () => {
    expect(findDate('CSE731 Data Engineering 15-12-2026 10:00 AM')?.iso).toBe('2026-12-15')
  })
  it('reads dd/mm/yyyy and dd.mm.yyyy', () => {
    expect(findDate('exam on 17/12/2026')?.iso).toBe('2026-12-17')
    expect(findDate('exam on 03.01.2027')?.iso).toBe('2027-01-03')
  })
  it('reads "19 Dec 2026" and full month names', () => {
    expect(findDate('Data Ethics 19 Dec 2026')?.iso).toBe('2026-12-19')
    expect(findDate('Data Ethics 5 September 2026')?.iso).toBe('2026-09-05')
  })
  it('reads "Dec 19, 2026" month-first', () => {
    expect(findDate('Dec 19, 2026 forenoon')?.iso).toBe('2026-12-19')
  })
  it('reads ISO yyyy-mm-dd without treating it as day-first', () => {
    expect(findDate('2026-12-15 slot A')?.iso).toBe('2026-12-15')
  })
  it('expands 2-digit years', () => {
    expect(findDate('15-12-26')?.iso).toBe('2026-12-15')
  })
  it('returns null when there is no date', () => {
    expect(findDate('Course Code   Course Title   Session')).toBeNull()
  })
})

describe('parseHallTicket', () => {
  const subjects = [
    { id: 1, name: 'Data Engineering' },
    { id: 2, name: 'Prompt Engineering' },
    { id: 3, name: 'Data Ethics' },
  ]

  // Mirrors what pdf-parse yields from a digital hall ticket (row per line).
  const text = `
CHRIST (Deemed to be University) - Hall Ticket
Course Code   Course Title                Date          Session
CSE731        Data Engineering            15-12-2026    10:00 AM
CSE732        Prompt Engineering          17/12/2026    02:00 PM
CSE733        Data Ethics                 19 Dec 2026   10:00 AM
Date of issue: 01-12-2026`

  it('produces one draft row per exam line, chronologically', () => {
    const rows = parseHallTicket(text, subjects)
    expect(rows.map((r) => r.date)).toEqual(['2026-12-15', '2026-12-17', '2026-12-19'])
  })

  it('matches subjects and derives clean exam names', () => {
    const rows = parseHallTicket(text, subjects)
    expect(rows[0]).toMatchObject({ date: '2026-12-15', subjectId: 1, name: 'Data Engineering' })
    expect(rows[1]).toMatchObject({ date: '2026-12-17', subjectId: 2, name: 'Prompt Engineering' })
    expect(rows[2]).toMatchObject({ date: '2026-12-19', subjectId: 3, name: 'Data Ethics' })
  })

  it('skips header rows and issue/print date lines', () => {
    const rows = parseHallTicket(text, subjects)
    expect(rows).toHaveLength(3)
    expect(rows.some((r) => r.date === '2026-12-01')).toBe(false)
  })

  it('matches a subject by embedded course code in its name', () => {
    const coded = [{ id: 9, name: 'Machine Learning (CSE801)' }]
    const rows = parseHallTicket('CSE801  Machine Lrng Theory  20-12-2026', coded)
    expect(rows[0].subjectId).toBe(9)
  })

  it('leaves subjectId null and keeps a usable name when nothing matches', () => {
    const rows = parseHallTicket('ZZZ999  Unknown Subject  21-12-2026', subjects)
    expect(rows[0].subjectId).toBeNull()
    expect(rows[0].name.length).toBeGreaterThan(1)
  })

  it('de-duplicates repeated date+name lines', () => {
    const dup = `CSE731 Data Engineering 15-12-2026\nCSE731 Data Engineering 15-12-2026`
    expect(parseHallTicket(dup, subjects)).toHaveLength(1)
  })

  // Mirrors the real OCR output of a CHRIST hall ticket: "<code> <name> <date>
  // <reporting> <exam-time> <venue>" per row, framed by the portal URL header
  // and the "generated ... IST" footer (both carry dates but aren't exams).
  it('parses real OCR-style hall-ticket rows and drops trailing times/venue', () => {
    const ocr = `10/04/2024, 15:59 kp.christuniversity.in/KnowledgePro/StudentLoginNewAction.do?method=printHallTicket
MA231 MATHEMATICS - II 15/04/2024 09:15 AM 09:30 BLOCK II" Floor:FIRST -
PH232P PHYSICS FOR ENGINEERS 17/04/2024 09:15 AM AM Room:K224
BS236 BIOLOGY FOR ENGINEERS 24/04/2024 09:15 AM AM Room:K224
Wed 10/04/2024 at 03:59:22 PM IST`
    const rows = parseHallTicket(ocr, [])
    expect(rows.map((r) => r.date)).toEqual(['2024-04-15', '2024-04-17', '2024-04-24'])
    expect(rows[0].name).toBe('MATHEMATICS - II')
    expect(rows[1].name).toBe('PHYSICS FOR ENGINEERS')
    // venue/times must not leak into the name
    expect(rows[0].name).not.toMatch(/BLOCK|Floor|Room|09:/)
    // portal URL header and IST footer are not exams
    expect(rows.some((r) => r.date === '2024-04-10')).toBe(false)
  })

  it('captures course code, both times, and the venue', () => {
    const line = 'MA231 MATHEMATICS - II 15/04/2024 09:15 AM 09:30 BLOCK II Floor:FIRST -'
    const [row] = parseHallTicket(line, [])
    expect(row.courseCode).toBe('MA231')
    // hall-ticket column order: reporting time, then exam time
    expect(row.reportingTime).toBe('09:15')
    expect(row.startTime).toBe('09:30')
    expect(row.location).toMatch(/BLOCK II/)
    expect(row.location).toMatch(/Floor:FIRST/)
  })

  it('converts PM times to 24h', () => {
    const [row] = parseHallTicket('CS101 SOMETHING 17/12/2026 01:30 PM 02:00 PM Room:A1', [])
    expect(row.reportingTime).toBe('13:30')
    expect(row.startTime).toBe('14:00')
  })

  it('leaves a time null rather than guessing when OCR only caught one', () => {
    const [row] = parseHallTicket('PH232P PHYSICS FOR ENGINEERS 17/04/2024 09:15 AM Room:K224', [])
    expect(row.reportingTime).toBe('09:15')
    expect(row.startTime).toBeNull()
  })

  it('stitches a venue that OCR wrapped onto the next line', () => {
    const wrapped = `MA231 MATHEMATICS - II 15/04/2024 09:15 AM 09:30 BLOCK II- Floor:FIRST -
Room:K224`
    const [row] = parseHallTicket(wrapped, [])
    expect(row.location).toMatch(/BLOCK II/)
    expect(row.location).toMatch(/Room:K224/)
  })

  // The scanned page has loose venue fragments floating between rows; without a
  // cap they all got glued onto one row's location.
  it('stitches at most one wrapped venue line and never duplicates', () => {
    const noisy = `MA231 MATHEMATICS - II 15/04/2024 09:15 AM 09:30 BLOCK II Floor:FIRST
Room:K224
BLOCK II- Floor:FIRST
BLOCK II- Floor:FIRST`
    const [row] = parseHallTicket(noisy, [])
    expect(row.location).toBe('BLOCK II Floor:FIRST Room:K224')
  })

  it('rejects OCR garbage as a location instead of storing it', () => {
    const [row] = parseHallTicket('BS236 BIOLOGY FOR ENGINEERS 24/04/2024 09:15 AM © uF Loa', [])
    expect(row.location).toBeNull()
    expect(row.date).toBe('2024-04-24') // the row itself still imports fine
  })

  it("does not absorb the instructions paragraph (which mentions 'Hall') as a venue", () => {
    const withInstructions = `BS236 BIOLOGY FOR ENGINEERS 24/04/2024 09:15 AM 09:30 Room:K224
1. Report to the Examination Hall before the reporting time given in the hall ticket.`
    const [row] = parseHallTicket(withInstructions, [])
    expect(row.location).toBe('Room:K224')
  })
})
