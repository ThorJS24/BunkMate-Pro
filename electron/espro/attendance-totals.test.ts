import { describe, it, expect } from 'vitest'
import { parseCourseWiseAttendance, compareAttendanceTotals } from './attendance-totals'

// Real getCourseWiseAttendance response, captured 2026-07-29 (session id 13).
const REAL_RESPONSE = [
  {
    courseId: 9170,
    courseName: 'DATA ENGINEERING',
    courseCode: 'CSE731',
    sessionName: 'SEMESTER - VII',
    totalHoursScheduled: 39.0,
    totalHoursAttended: 33.0,
    totalPercentage: 84.62,
    hasMultipleTypes: false,
    isCocurricularPercentage: true,
    courseTypeDetails: [
      { attendanceType: 'Theory', subjectClassesHeld: 39.0, subjectClassesAttended: 33.0, subjectClassesAttendedPercentage: 84.62 },
    ],
  },
  {
    courseId: 9051,
    courseName: 'INTERNSHIP - II',
    courseCode: 'CSE785',
    sessionName: 'SEMESTER - VII',
    totalHoursScheduled: 0.0,
    totalHoursAttended: 0.0,
    totalPercentage: 0.0,
    hasMultipleTypes: false,
    isCocurricularPercentage: true,
    courseTypeDetails: [],
  },
]

describe('parseCourseWiseAttendance', () => {
  it('parses the real captured response shape', () => {
    const rows = parseCourseWiseAttendance(REAL_RESPONSE)
    expect(rows).toEqual([
      { courseCode: 'CSE731', courseName: 'DATA ENGINEERING', totalHoursScheduled: 39, totalHoursAttended: 33, totalPercentage: 84.62 },
      { courseCode: 'CSE785', courseName: 'INTERNSHIP - II', totalHoursScheduled: 0, totalHoursAttended: 0, totalPercentage: 0 },
    ])
  })

  it('returns an empty list for a non-array response', () => {
    expect(parseCourseWiseAttendance({ error: 'not an array' })).toEqual([])
    expect(parseCourseWiseAttendance(null)).toEqual([])
  })

  it('skips rows missing a course name or with non-numeric totals', () => {
    const rows = parseCourseWiseAttendance([
      { courseName: '', totalHoursScheduled: 10, totalHoursAttended: 5, totalPercentage: 50 },
      { courseName: 'OK', totalHoursScheduled: 'ten', totalHoursAttended: 5, totalPercentage: 50 },
      { courseName: 'Also OK', totalHoursScheduled: 10, totalHoursAttended: 5, totalPercentage: 50 },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].courseName).toBe('Also OK')
  })
})

describe('compareAttendanceTotals', () => {
  it('flags a match when percentages are within tolerance', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: 'CSE731', courseName: 'Data Engineering', totalHoursScheduled: 39, totalHoursAttended: 33, totalPercentage: 84.62 }],
      localTotals: [{ subjectName: 'Data Engineering', attended: 33, total: 39, percentage: 84.62 }],
      toleranceP: 0.5,
    })
    expect(rows).toEqual([
      {
        subjectName: 'Data Engineering',
        status: 'match',
        espro: { attended: 33, total: 39, percentage: 84.62 },
        local: { attended: 33, total: 39, percentage: 84.62 },
      },
    ])
  })

  it('flags a mismatch when percentages differ beyond tolerance', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: null, courseName: 'Data Engineering', totalHoursScheduled: 39, totalHoursAttended: 33, totalPercentage: 84.62 }],
      localTotals: [{ subjectName: 'Data Engineering', attended: 31, total: 36, percentage: 86.11 }],
      toleranceP: 0.5,
    })
    expect(rows[0].status).toBe('mismatch')
  })

  it('matches subject names case-insensitively', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: null, courseName: 'DATA ENGINEERING', totalHoursScheduled: 10, totalHoursAttended: 10, totalPercentage: 100 }],
      localTotals: [{ subjectName: 'data engineering', attended: 10, total: 10, percentage: 100 }],
      toleranceP: 0.5,
    })
    expect(rows[0].status).toBe('match')
  })

  it('surfaces an ESPRO subject with no local match as espro-only', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: null, courseName: 'Internship - II', totalHoursScheduled: 0, totalHoursAttended: 0, totalPercentage: 0 }],
      localTotals: [],
      toleranceP: 0.5,
    })
    expect(rows).toEqual([{ subjectName: 'Internship - II', status: 'espro-only', espro: { attended: 0, total: 0, percentage: 0 }, local: null }])
  })

  it('surfaces a local subject with no ESPRO match as local-only', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [],
      localTotals: [{ subjectName: 'Mentoring', attended: 5, total: 5, percentage: 100 }],
      toleranceP: 0.5,
    })
    expect(rows).toEqual([{ subjectName: 'Mentoring', status: 'local-only', espro: null, local: { attended: 5, total: 5, percentage: 100 } }])
  })

  it('treats a null local percentage (no records yet) as always a mismatch', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: null, courseName: 'X', totalHoursScheduled: 10, totalHoursAttended: 8, totalPercentage: 80 }],
      localTotals: [{ subjectName: 'X', attended: 0, total: 0, percentage: null }],
      toleranceP: 0.5,
    })
    expect(rows[0].status).toBe('mismatch')
  })

  // Real-world case (2026-07-29): BunkMate has no separate course-code
  // field, so this user's subject names fold the code in — "Data Engineering
  // (CSE731)" — while ESPRO gives a plain name ("DATA ENGINEERING") and the
  // code separately. A bare exact-name match missed every subject; these
  // lock in the code-in-name fallback that fixes it.
  it('matches when the local subject name has the ESPRO course code folded in', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: 'CSE731', courseName: 'DATA ENGINEERING', totalHoursScheduled: 39, totalHoursAttended: 33, totalPercentage: 84.62 }],
      localTotals: [{ subjectName: 'Data Engineering (CSE731)', attended: 30, total: 36, percentage: 83.33 }],
      toleranceP: 0.5,
    })
    expect(rows[0]).toMatchObject({ subjectName: 'DATA ENGINEERING', status: 'mismatch' })
    expect(rows[0].local).toEqual({ attended: 30, total: 36, percentage: 83.33 })
  })

  it('matches "PROJECT WORK I" against a locally-named "Project Work (CSE784)" via the course code', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: 'CSE784', courseName: 'PROJECT WORK I', totalHoursScheduled: 101, totalHoursAttended: 88, totalPercentage: 87.13 }],
      localTotals: [{ subjectName: 'Project Work (CSE784)', attended: 119, total: 136, percentage: 87.5 }],
      toleranceP: 0.5,
    })
    expect(rows[0].status).toBe('match')
  })

  it('does not let one local subject match twice', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [
        { courseCode: 'CSE731', courseName: 'DATA ENGINEERING', totalHoursScheduled: 10, totalHoursAttended: 10, totalPercentage: 100 },
        { courseCode: 'CSE732', courseName: 'DATA ENGINEERING LAB', totalHoursScheduled: 10, totalHoursAttended: 10, totalPercentage: 100 },
      ],
      localTotals: [{ subjectName: 'Data Engineering (CSE731)', attended: 10, total: 10, percentage: 100 }],
      toleranceP: 0.5,
    })
    expect(rows[0].local).not.toBeNull()
    expect(rows[1].local).toBeNull()
    expect(rows[1].status).toBe('espro-only')
  })

  it('falls back to substring containment when no course code is available', () => {
    const rows = compareAttendanceTotals({
      esproTotals: [{ courseCode: null, courseName: 'DATA ENGINEERING', totalHoursScheduled: 10, totalHoursAttended: 10, totalPercentage: 100 }],
      localTotals: [{ subjectName: 'Data Engineering (Elective)', attended: 10, total: 10, percentage: 100 }],
      toleranceP: 0.5,
    })
    expect(rows[0].status).toBe('match')
  })
})
