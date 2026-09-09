import { describe, it, expect } from 'vitest'
import {
  parsePerDayAttendanceCount,
  parsePerDayAttendanceDetails,
  compareDayAttendance,
  matchEsproCourseToLocalSubject,
  periodNumberForTime,
  planEsproSyncForDate,
  summarizeDayComparison,
  type DayComparisonRow,
} from './attendance-days'

// Real getPerDayAttendanceCount response, captured 2026-07-31 (session id 13,
// trimmed to a representative slice of the real ~34-row response).
const REAL_DAY_COUNT_RESPONSE = [
  { scheduledHours: null, presentCount: 5.0, absentCount: 0.0, cocurricularCount: 0.0, medicalLeaveCount: 0.0, overallPercentage: null, isCocurricularPercentage: null, date: '2026-06-01' },
  { scheduledHours: null, presentCount: 0.0, absentCount: 3.0, cocurricularCount: 0.0, medicalLeaveCount: 0.0, overallPercentage: null, isCocurricularPercentage: null, date: '2026-07-04' },
  { scheduledHours: null, presentCount: 0.0, absentCount: 6.0, cocurricularCount: 0.0, medicalLeaveCount: 0.0, overallPercentage: null, isCocurricularPercentage: null, date: '2026-07-20' },
]

// Real getPerDayAttendanceDetails response for startDate 2026-07-02 (session id 13).
const REAL_PER_DAY_DETAILS_RESPONSE = [
  { courseCode: 'CSE784', courseName: 'PROJECT WORK I', periodName: 'Period-1', periodStartTime: '09:00', periodEndTime: '10:00', status: 'P', sessionName: 'SEMESTER - VII', isPresent: true, isMedical: false, isCocurricular: false, attendanceType: 'Practical' },
  { courseCode: 'CSE743E07', courseName: 'DATA ETHICS AND PRIVACY', periodName: 'Period-2', periodStartTime: '10:00', periodEndTime: '11:00', status: 'P', sessionName: 'SEMESTER - VII', isPresent: true, isMedical: false, isCocurricular: false, attendanceType: 'Theory' },
]

describe('parsePerDayAttendanceCount', () => {
  it('parses the real captured response shape', () => {
    expect(parsePerDayAttendanceCount(REAL_DAY_COUNT_RESPONSE)).toEqual([
      { date: '2026-06-01', present: 5, absent: 0 },
      { date: '2026-07-04', present: 0, absent: 3 },
      { date: '2026-07-20', present: 0, absent: 6 },
    ])
  })

  it('returns an empty list for a non-array response', () => {
    expect(parsePerDayAttendanceCount({ error: 'nope' })).toEqual([])
    expect(parsePerDayAttendanceCount(null)).toEqual([])
  })

  it('skips a row with no date', () => {
    const rows = parsePerDayAttendanceCount([{ presentCount: 5, absentCount: 0, date: null }])
    expect(rows).toEqual([])
  })
})

describe('parsePerDayAttendanceDetails', () => {
  it('parses the real captured response shape', () => {
    expect(parsePerDayAttendanceDetails(REAL_PER_DAY_DETAILS_RESPONSE)).toEqual([
      {
        courseCode: 'CSE784',
        courseName: 'PROJECT WORK I',
        periodName: 'Period-1',
        periodStartTime: '09:00',
        periodEndTime: '10:00',
        isPresent: true,
        isCocurricular: false,
        isMedical: false,
        attendanceType: 'Practical',
      },
      {
        courseCode: 'CSE743E07',
        courseName: 'DATA ETHICS AND PRIVACY',
        periodName: 'Period-2',
        periodStartTime: '10:00',
        periodEndTime: '11:00',
        isPresent: true,
        isCocurricular: false,
        isMedical: false,
        attendanceType: 'Theory',
      },
    ])
  })

  it('skips a row missing a course name or period times', () => {
    const rows = parsePerDayAttendanceDetails([
      { courseName: '', periodStartTime: '09:00', periodEndTime: '10:00' },
      { courseName: 'X', periodStartTime: '', periodEndTime: '10:00' },
      { courseName: 'Y', periodStartTime: '09:00', periodEndTime: '10:00', isPresent: true },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0].courseName).toBe('Y')
  })
})

describe('compareDayAttendance', () => {
  it('flags a match when present/absent counts agree exactly', () => {
    const rows = compareDayAttendance({
      esproDays: [{ date: '2026-06-01', present: 5, absent: 0 }],
      localDays: [{ date: '2026-06-01', present: 5, absent: 0 }],
    })
    expect(rows).toEqual([{ date: '2026-06-01', status: 'match', espro: { present: 5, absent: 0 }, local: { present: 5, absent: 0 } }])
  })

  it('flags a mismatch when counts differ', () => {
    const rows = compareDayAttendance({
      esproDays: [{ date: '2026-07-04', present: 0, absent: 3 }],
      localDays: [{ date: '2026-07-04', present: 3, absent: 0 }],
    })
    expect(rows[0].status).toBe('mismatch')
  })

  it('surfaces an ESPRO date with no local record as espro-only', () => {
    const rows = compareDayAttendance({
      esproDays: [{ date: '2026-07-20', present: 0, absent: 6 }],
      localDays: [],
    })
    expect(rows).toEqual([{ date: '2026-07-20', status: 'espro-only', espro: { present: 0, absent: 6 }, local: null }])
  })

  it('surfaces a local date with no ESPRO record as local-only', () => {
    const rows = compareDayAttendance({
      esproDays: [],
      localDays: [{ date: '2026-08-01', present: 2, absent: 0 }],
    })
    expect(rows).toEqual([{ date: '2026-08-01', status: 'local-only', espro: null, local: { present: 2, absent: 0 } }])
  })

  it('sorts rows chronologically regardless of input order', () => {
    const rows = compareDayAttendance({
      esproDays: [
        { date: '2026-07-20', present: 1, absent: 0 },
        { date: '2026-06-01', present: 1, absent: 0 },
      ],
      localDays: [],
    })
    expect(rows.map((r) => r.date)).toEqual(['2026-06-01', '2026-07-20'])
  })
})

describe('matchEsproCourseToLocalSubject', () => {
  const candidates = [
    { id: 1, name: 'Data Engineering (CSE731)' },
    { id: 2, name: 'Project Work (CSE784)' },
  ]

  it('matches by course code folded into the local name', () => {
    const match = matchEsproCourseToLocalSubject('CSE731', 'DATA ENGINEERING', candidates)
    expect(match?.id).toBe(1)
  })

  it('falls back to substring containment with no course code', () => {
    const match = matchEsproCourseToLocalSubject(null, 'Project Work', candidates)
    expect(match?.id).toBe(2)
  })

  it('returns undefined when nothing matches', () => {
    expect(matchEsproCourseToLocalSubject('CSE999', 'UNRELATED COURSE', candidates)).toBeUndefined()
  })
})

describe('periodNumberForTime', () => {
  const periodTimes = [
    { period: 1, startTime: '09:00' },
    { period: 2, startTime: '10:00' },
    { period: 3, startTime: '11:00' },
  ]

  it('finds the period whose start time matches', () => {
    expect(periodNumberForTime(periodTimes, '10:00')).toBe(2)
  })

  it('returns undefined for a time with no matching period', () => {
    expect(periodNumberForTime(periodTimes, '14:00')).toBeUndefined()
  })
})

describe('planEsproSyncForDate', () => {
  const localSubjects = [
    { id: 1, name: 'Project Work (CSE784)' },
    { id: 2, name: 'Data Ethics (CSE743E07)' },
  ]
  const periodTimes = [
    { period: 1, startTime: '09:00' },
    { period: 2, startTime: '10:00' },
  ]

  it('plans a create for a period with no existing local record', () => {
    const { entries, unmatched } = planEsproSyncForDate({
      date: '2026-07-02',
      esproPeriods: [
        { courseCode: 'CSE784', courseName: 'PROJECT WORK I', periodName: 'Period-1', periodStartTime: '09:00', periodEndTime: '10:00', isPresent: true, attendanceType: 'Practical' },
      ],
      localSubjects,
      periodTimes,
      existingByPeriod: new Map(),
    })
    expect(unmatched).toEqual([])
    expect(entries).toEqual([{ date: '2026-07-02', period: 1, subjectId: 1, subjectName: 'Project Work (CSE784)', status: 'present', action: 'create' }])
  })

  it('plans an update when the local status disagrees with ESPRO', () => {
    const { entries } = planEsproSyncForDate({
      date: '2026-07-04',
      esproPeriods: [
        { courseCode: 'CSE743E07', courseName: 'DATA ETHICS AND PRIVACY', periodName: 'Period-2', periodStartTime: '10:00', periodEndTime: '11:00', isPresent: false, attendanceType: 'Theory' },
      ],
      localSubjects,
      periodTimes,
      existingByPeriod: new Map([['2:2', 'present']]),
    })
    expect(entries).toEqual([{ date: '2026-07-04', period: 2, subjectId: 2, subjectName: 'Data Ethics (CSE743E07)', status: 'absent', action: 'update' }])
  })

  it('plans no-op when the local status already agrees', () => {
    const { entries } = planEsproSyncForDate({
      date: '2026-07-02',
      esproPeriods: [
        { courseCode: 'CSE784', courseName: 'PROJECT WORK I', periodName: 'Period-1', periodStartTime: '09:00', periodEndTime: '10:00', isPresent: true, attendanceType: 'Practical' },
      ],
      localSubjects,
      periodTimes,
      existingByPeriod: new Map([['1:1', 'present']]),
    })
    expect(entries[0].action).toBe('unchanged')
  })

  it('surfaces a period as unmatched when no local subject matches', () => {
    const { entries, unmatched } = planEsproSyncForDate({
      date: '2026-07-02',
      esproPeriods: [
        { courseCode: 'IT999', courseName: 'UNKNOWN COURSE', periodName: 'Period-1', periodStartTime: '09:00', periodEndTime: '10:00', isPresent: true, attendanceType: 'Theory' },
      ],
      localSubjects,
      periodTimes,
      existingByPeriod: new Map(),
    })
    expect(entries).toEqual([])
    expect(unmatched).toHaveLength(1)
  })

  it('surfaces a period as unmatched when its clock time has no allocated period', () => {
    const { entries, unmatched } = planEsproSyncForDate({
      date: '2026-07-02',
      esproPeriods: [
        { courseCode: 'CSE784', courseName: 'PROJECT WORK I', periodName: 'Period-5', periodStartTime: '14:00', periodEndTime: '15:00', isPresent: true, attendanceType: 'Practical' },
      ],
      localSubjects,
      periodTimes,
      existingByPeriod: new Map(),
    })
    expect(entries).toEqual([])
    expect(unmatched).toHaveLength(1)
  })
})

function dayRow(date: string, status: DayComparisonRow['status']): DayComparisonRow {
  return { date, status, espro: { present: 1, absent: 0 }, local: { present: 1, absent: 0 } }
}

describe('summarizeDayComparison', () => {
  it('counts each status independently of any capping', () => {
    const rows = [
      dayRow('2026-06-01', 'match'),
      dayRow('2026-06-02', 'match'),
      dayRow('2026-06-03', 'mismatch'),
      dayRow('2026-06-04', 'espro-only'),
      dayRow('2026-06-05', 'espro-only'),
      dayRow('2026-06-06', 'local-only'),
    ]
    expect(summarizeDayComparison(rows)).toEqual({ total: 6, match: 2, mismatch: 1, esproOnly: 2, localOnly: 1 })
  })

  it('returns all zeros for an empty list', () => {
    expect(summarizeDayComparison([])).toEqual({ total: 0, match: 0, mismatch: 0, esproOnly: 0, localOnly: 0 })
  })
})

