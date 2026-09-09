import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import { schema } from '../../../src/db/schema'
import type { AppDatabase } from '../client'
import * as sampleDataRepo from './sample-data'
import * as semestersRepo from './semesters'
import * as subjectsRepo from './subjects'
import * as timetableSlotsRepo from './timetable-slots'
import * as attendanceRecordsRepo from './attendance-records'
import * as settingsRepo from './settings'

function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(__dirname, '../migrations') })
  return db
}

describe('sample-data repository', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('seeds an active semester with subjects, a Mon-Fri timetable, and attendance history', () => {
    const sem = sampleDataRepo.createSampleData(db)

    expect(sem.label).toBe('Demo Semester')
    expect(sem.isActive).toBe(true)

    const subjects = subjectsRepo.listSubjects(db, { semester: sem.label })
    expect(subjects.length).toBeGreaterThan(0)

    const slots = timetableSlotsRepo.listTimetableSlots(db, { semester: sem.label })
    // 5 teaching days x 6 periods (5 class + 1 lunch) = 30 slots.
    expect(slots.length).toBe(30)
    expect(slots.filter((s) => s.type === 'lunch').length).toBe(5)

    const records = attendanceRecordsRepo.listAttendanceRecords(db, {})
    expect(records.length).toBeGreaterThan(0)
    expect(records.every((r) => r.status === 'present' || r.status === 'absent')).toBe(true)

    expect(settingsRepo.getSettings(db).currentSemester).toBe(sem.label)
  })

  it('avoids a label collision when called more than once', () => {
    const first = sampleDataRepo.createSampleData(db)
    const second = sampleDataRepo.createSampleData(db)
    expect(first.label).not.toBe(second.label)
    expect(semestersRepo.listSemesters(db)).toHaveLength(2)
    // The most recent seed is the one left active.
    expect(second.isActive).toBe(true)
  })
})
