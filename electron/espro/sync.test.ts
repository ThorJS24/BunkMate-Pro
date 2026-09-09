// Orchestration tests for the highest-stakes ESPRO flow: unlike
// attendance-days.test.ts / attendance-totals.test.ts (which test pure
// parsing/comparison helpers), this exercises esproSyncAttendance /
// esproCompareAttendance end-to-end against a real in-memory DB, with only
// the network boundary (./login) and credential storage (./credential-store,
// which needs Electron's safeStorage) mocked out. Sync is the one ESPRO path
// that writes real attendance records, so its guard clauses and
// create/update/unmatched accounting deserve direct coverage, not just
// coverage of the pieces it's built from.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import { schema } from '../../src/db/schema'
import type { AppDatabase } from '../db/client'
import { semestersRepo, subjectsRepo, attendanceRecordsRepo } from '../db/repositories'
import type { RawResponse } from './login'

vi.mock('./credential-store', () => ({
  loadEsproCredential: vi.fn(),
  readEsproSessionId: vi.fn(),
  saveEsproSessionId: vi.fn(),
}))

vi.mock('./login', () => ({
  esproLogin: vi.fn(async () => ({
    accessToken: 'test-token',
    refreshToken: 'r',
    expiresAt: Date.now() + 60_000,
    baseUrl: 'https://espro.christuniversity.in:444',
  })),
  httpRequest: vi.fn(),
}))

import { loadEsproCredential, readEsproSessionId, saveEsproSessionId } from './credential-store'
import { httpRequest } from './login'
import { esproSyncAttendance, esproCompareAttendance, esproGetDayPeriodDetail } from './sync'

const mockedHttpRequest = vi.mocked(httpRequest)
const mockedLoadCred = vi.mocked(loadEsproCredential)
const mockedReadSession = vi.mocked(readEsproSessionId)
const mockedSaveSession = vi.mocked(saveEsproSessionId)

function jsonResponse(body: unknown): RawResponse {
  return { status: 200, headers: {}, body: JSON.stringify(body) }
}

function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(__dirname, '../db/migrations') })
  return db
}

describe('esproSyncAttendance', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
    mockedHttpRequest.mockReset()
    mockedSaveSession.mockReset()
    mockedLoadCred.mockReturnValue({ username: 'stu', password: 'pw' })
    mockedReadSession.mockReturnValue('13')
  })

  it('refuses when no ESPRO credential is stored', async () => {
    mockedLoadCred.mockReturnValue(null)
    await expect(esproSyncAttendance(db, '/tmp', '2026-1')).rejects.toThrow(/No ESPRO credential/)
    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('auto-discovers session/term number when not set', async () => {
    mockedReadSession.mockReturnValue(null)
    mockedHttpRequest.mockResolvedValue(jsonResponse([]))
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
      periodsPerDay: 7,
      periodTimes: [{ period: 1, startTime: '09:00', endTime: '10:00' }],
    })
    await esproSyncAttendance(db, '/tmp', '2026-1')
    expect(mockedSaveSession).toHaveBeenCalled()
  })

  it('refuses when the semester does not exist locally', async () => {
    await expect(esproSyncAttendance(db, '/tmp', 'Nonexistent')).rejects.toThrow(/No semester found/)
  })

  it('reports missingPeriodTimes without contacting ESPRO when period times are not allocated', async () => {
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 6,
      lunchPeriod: 4,
    })

    const result = await esproSyncAttendance(db, '/tmp', '2026-1')

    expect(result).toEqual({ created: 0, updated: 0, unchanged: 0, unmatchedDates: [], missingPeriodTimes: true })
    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('creates a record for an ESPRO-only date, and reports a period it cannot confidently place', async () => {
    const periodTimes = [{ period: 1, startTime: '09:00', endTime: '10:00' }]
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 6,
      lunchPeriod: 4,
      isActive: true,
      periodTimes,
    })
    const subject = subjectsRepo.createSubject(db, {
      name: 'Data Structures (CSE201)',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })

    mockedHttpRequest.mockImplementation(async (opts) => {
      if (opts.url.includes('getPerDayAttendanceCount')) {
        return jsonResponse([{ date: '2026-02-02', presentCount: 1, absentCount: 0 }])
      }
      if (opts.url.includes('getPerDayAttendanceDetails')) {
        return jsonResponse([
          {
            courseCode: 'CSE201',
            courseName: 'DATA STRUCTURES',
            periodName: 'Period-1',
            periodStartTime: '09:00',
            periodEndTime: '10:00',
            isPresent: true,
            attendanceType: 'Theory',
          },
          {
            // No local subject matches this course, and no allocated period
            // starts at this clock time — should surface as unmatched, not
            // silently dropped or guessed.
            courseCode: 'UNK999',
            courseName: 'UNKNOWN COURSE',
            periodName: 'Period-9',
            periodStartTime: '23:00',
            periodEndTime: '23:50',
            isPresent: true,
            attendanceType: 'Theory',
          },
        ])
      }
      throw new Error(`unexpected request: ${opts.url}`)
    })

    const result = await esproSyncAttendance(db, '/tmp', '2026-1')

    expect(result.created).toBe(1)
    expect(result.updated).toBe(0)
    expect(result.unmatchedDates).toEqual(['2026-02-02'])

    const records = attendanceRecordsRepo.listAttendanceRecords(db, {})
    expect(records).toHaveLength(1)
    expect(records[0]).toMatchObject({
      subjectId: subject.id,
      date: '2026-02-02',
      period: 1,
      status: 'present',
      source: 'espro',
    })
  })

  it('leaves an already-matching date unchanged and writes nothing new', async () => {
    const periodTimes = [{ period: 1, startTime: '09:00', endTime: '10:00' }]
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 6,
      lunchPeriod: 4,
      isActive: true,
      periodTimes,
    })
    const subject = subjectsRepo.createSubject(db, {
      name: 'Data Structures (CSE201)',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })
    attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-02-02',
      period: 1,
      status: 'present',
      source: 'manual',
      slotId: null,
    })

    mockedHttpRequest.mockImplementation(async (opts) => {
      if (opts.url.includes('getPerDayAttendanceCount')) {
        return jsonResponse([{ date: '2026-02-02', presentCount: 1, absentCount: 0 }])
      }
      throw new Error(`unexpected request: ${opts.url}`)
    })

    const result = await esproSyncAttendance(db, '/tmp', '2026-1')

    expect(result).toMatchObject({ created: 0, updated: 0, unchanged: 0, unmatchedDates: [] })
    expect(attendanceRecordsRepo.listAttendanceRecords(db, {})).toHaveLength(1)
    // A matching date needs no period-level detail fetch at all.
    expect(mockedHttpRequest).toHaveBeenCalledTimes(1)
  })
})

describe('esproCompareAttendance', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
    mockedHttpRequest.mockReset()
    mockedLoadCred.mockReturnValue({ username: 'stu', password: 'pw' })
    mockedReadSession.mockReturnValue('13')
  })

  it('refuses when no ESPRO credential is stored', async () => {
    mockedLoadCred.mockReturnValue(null)
    await expect(esproCompareAttendance(db, '/tmp', '2026-1')).rejects.toThrow(/No ESPRO credential/)
  })

  it('auto-discovers session/term number when not set', async () => {
    mockedReadSession.mockReturnValue(null)
    mockedHttpRequest.mockResolvedValue(jsonResponse([]))
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-06-30',
    })
    await esproCompareAttendance(db, '/tmp', '2026-1')
    expect(mockedSaveSession).toHaveBeenCalled()
  })
})

describe('esproGetDayPeriodDetail', () => {
  let db: AppDatabase

  beforeEach(() => {
    db = createTestDb()
    mockedHttpRequest.mockReset()
    mockedSaveSession.mockReset()
    mockedLoadCred.mockReturnValue({ username: 'stu', password: 'pw' })
    mockedReadSession.mockReturnValue('13')
  })

  it('refuses when no ESPRO credential is stored', async () => {
    mockedLoadCred.mockReturnValue(null)
    await expect(esproGetDayPeriodDetail(db, '/tmp', '2026-1', '2026-02-02')).rejects.toThrow(/No ESPRO credential/)
    expect(mockedHttpRequest).not.toHaveBeenCalled()
  })

  it('auto-discovers session/term number when not set', async () => {
    mockedReadSession.mockReturnValue(null)
    mockedHttpRequest.mockResolvedValue(jsonResponse([]))
    await esproGetDayPeriodDetail(db, '/tmp', '2026-1', '2026-02-02')
    expect(mockedSaveSession).toHaveBeenCalled()
  })

  it('returns ESPRO periods alongside the matching local periods for exactly that one date, with times from the semester', async () => {
    const periodTimes = [
      { period: 1, startTime: '09:00', endTime: '10:00' },
      { period: 2, startTime: '10:00', endTime: '11:00' },
    ]
    semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 6,
      lunchPeriod: 4,
      isActive: true,
      periodTimes,
    })
    const subject = subjectsRepo.createSubject(db, {
      name: 'Data Structures (CSE201)',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })
    attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-02-02',
      period: 1,
      status: 'present',
      source: 'manual',
      slotId: null,
    })
    // A different date's record must not leak into this one date's detail.
    attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-02-03',
      period: 1,
      status: 'absent',
      source: 'manual',
      slotId: null,
    })

    mockedHttpRequest.mockImplementation(async (opts) => {
      if (opts.url.includes('getPerDayAttendanceDetails')) {
        return jsonResponse([
          {
            courseCode: 'CSE201',
            courseName: 'DATA STRUCTURES',
            periodName: 'Period-1',
            periodStartTime: '09:00',
            periodEndTime: '10:00',
            isPresent: true,
            attendanceType: 'Theory',
          },
        ])
      }
      throw new Error(`unexpected request: ${opts.url}`)
    })

    const result = await esproGetDayPeriodDetail(db, '/tmp', '2026-1', '2026-02-02')

    expect(result.date).toBe('2026-02-02')
    expect(result.espro).toEqual([
      {
        courseCode: 'CSE201',
        courseName: 'DATA STRUCTURES',
        periodName: 'Period-1',
        periodStartTime: '09:00',
        periodEndTime: '10:00',
        isPresent: true,
        isCocurricular: false,
        isMedical: false,
        attendanceType: 'Theory',
      },
    ])
    expect(result.local).toEqual([
      { subjectName: 'Data Structures (CSE201)', period: 1, startTime: '09:00', endTime: '10:00', status: 'present' },
    ])
  })
})
