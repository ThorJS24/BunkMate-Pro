import { describe, expect, it } from 'vitest'
import { parseAcademicCalendarText } from './academic-calendar-pdf-import'

// Fixture lines below are pulled verbatim from a real extraction of CHRIST's
// 2026-27 academic calendar PDF (via electron/pdf-text.ts), not invented —
// see the parser file's header comment for why that matters.
describe('parseAcademicCalendarText', () => {
  it('parses a same-line "Holiday - Label" entry', () => {
    const text = ['June 2026', '26 (Fri) Holiday - Last Day of Muharram'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-06-26', label: 'Last Day of Muharram', isWorkingSaturday: false },
    ])
  })

  it('tolerates "Holiday -Label" with no space after the dash', () => {
    const text = ['August 2026', '26 (Wed) Holiday -Eid-Milad'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-08-26', label: 'Eid-Milad', isWorkingSaturday: false },
    ])
  })

  it('tolerates "Holiday- Label" with no space before the dash', () => {
    const text = ['October 2026', '20 (Tue) Holiday- Mahanavami /Ayudhapooja'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-10-20', label: 'Mahanavami /Ayudhapooja', isWorkingSaturday: false },
    ])
  })

  it('tolerates spaces inside the weekday parens', () => {
    const text = ['October 2026', '10 ( Sat ) Holiday - Mahalaya Amavasye'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-10-10', label: 'Mahalaya Amavasye', isWorkingSaturday: false },
    ])
  })

  it('handles the date and holiday text landing on separate lines', () => {
    const text = ['October 2026', '21 (Wed)', 'Holiday- Vijayadasami'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-10-21', label: 'Vijayadasami', isWorkingSaturday: false },
    ])
  })

  it('strips the trailing paren from a compensatory-holiday label', () => {
    const text = ['November 2026', '28 (Sat) Holiday (Compensatory for Third Saturday, 21 November 2026)'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-11-28', label: 'Compensatory for Third Saturday, 21 November 2026', isWorkingSaturday: false },
    ])
  })

  it('detects a working-Saturday entry distinct from a holiday', () => {
    const text = ['October 2026', '17 (Sat) Third Saturday working day for Faculty, Staff and Students.'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-10-17', label: 'Working Saturday', isWorkingSaturday: true },
    ])
  })

  it('does not mistake a multi-line class-commencement entry for a holiday', () => {
    const text = [
      'June 2026',
      '01 (Mon)',
      'Commencement of classes for III, V semester UG and III semester PG -',
      'Bangalore Bannerghatta Road Campus',
    ].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([])
  })

  it('does not mistake a date embedded mid-sentence for a table date column', () => {
    const text = ['October 2026', "(13-15)", 'Mid trimester Examinations for I and IV trimesters - MBA'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([])
  })

  it('ignores unrelated "Holidays" prose that never follows a date column', () => {
    const text = [
      'June 2027',
      '01 (Tue) Reopening for Academic Year 2027-28 for senior students',
      'Note: Holidays are subject to change based on the official notifications issued by the Government of',
      'Karnataka',
    ].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([])
  })

  it('resets the pending date on a new month header', () => {
    const text = ['June 2026', '21 (Wed)', 'July 2026', 'Holiday - Some Unrelated Text'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([])
  })

  it('parses a realistic multi-month excerpt end to end', () => {
    const text = [
      'August 2026',
      '15 (Sat) Holiday - Independence Day',
      '26 (Wed) Holiday -Eid-Milad',
      'September 2026',
      '14 (Mon) Holiday - Ganesh Chaturthi',
      'October 2026',
      '02 (Fri) Holiday - Gandhi Jayanthi',
      '17 (Sat) Third Saturday working day for Faculty, Staff and Students.',
      '21 (Wed)',
      'Holiday- Vijayadasami',
    ].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2026-08-15', label: 'Independence Day', isWorkingSaturday: false },
      { date: '2026-08-26', label: 'Eid-Milad', isWorkingSaturday: false },
      { date: '2026-09-14', label: 'Ganesh Chaturthi', isWorkingSaturday: false },
      { date: '2026-10-02', label: 'Gandhi Jayanthi', isWorkingSaturday: false },
      { date: '2026-10-17', label: 'Working Saturday', isWorkingSaturday: true },
      { date: '2026-10-21', label: 'Vijayadasami', isWorkingSaturday: false },
    ])
  })

  it('de-duplicates if the same date appears twice, keeping the first', () => {
    const text = ['May 2027', '01 (Sat) Holiday - May Day', '01 (Sat) Holiday - May Day (repeat)'].join('\n')
    expect(parseAcademicCalendarText(text)).toEqual([
      { date: '2027-05-01', label: 'May Day', isWorkingSaturday: false },
    ])
  })
})
