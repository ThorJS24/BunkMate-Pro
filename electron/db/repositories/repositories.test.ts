import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import path from 'node:path'
import { schema } from '../../../src/db/schema'
import type { AppDatabase } from '../client'
import * as semestersRepo from './semesters'
import * as subjectsRepo from './subjects'
import * as timetableSlotsRepo from './timetable-slots'
import * as attendanceRecordsRepo from './attendance-records'
import * as holidaysRepo from './holidays'
import * as leavePlansRepo from './leave-plans'
import * as yellowFormsRepo from './yellow-forms'
import * as settingsRepo from './settings'
import * as periodTypeRulesRepo from './period-type-rules'
import { PERIOD_TYPES } from '../../../src/db/schema'
import { computeAttendance, aggregateOverall } from '../../../src/lib/attendance-engine'
import { scopeRecordsToSubjects } from '../../../src/lib/semester-scope'

function createTestDb(): AppDatabase {
  const sqlite = new Database(':memory:')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: path.join(__dirname, '../migrations') })
  return db
}

describe('subjects repository', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('creates, lists, updates, archives, and deletes a subject', () => {
    const created = subjectsRepo.createSubject(db, {
      name: 'Data Structures',
      semester: '2026-1',
      credits: 4,
      faculty: 'Dr. Rao',
      category: 'core',
    })
    expect(created.id).toBeTypeOf('number')
    expect(created.archived).toBe(false)

    expect(subjectsRepo.listSubjects(db, { semester: '2026-1' })).toHaveLength(1)
    expect(subjectsRepo.listSubjects(db, { semester: '2025-2' })).toHaveLength(0)

    const updated = subjectsRepo.updateSubject(db, created.id, { credits: 5 })
    expect(updated.credits).toBe(5)

    const archived = subjectsRepo.setSubjectArchived(db, created.id, true)
    expect(archived.archived).toBe(true)
    expect(subjectsRepo.listSubjects(db, { semester: '2026-1' })).toHaveLength(0)
    expect(subjectsRepo.listSubjects(db, { semester: '2026-1', includeArchived: true })).toHaveLength(1)

    subjectsRepo.deleteSubject(db, created.id)
    expect(subjectsRepo.getSubject(db, created.id)).toBeUndefined()
  })

  it('defaults customMinTarget to null and persists an explicit override', () => {
    const created = subjectsRepo.createSubject(db, {
      name: 'Operating Systems',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })
    expect(created.customMinTarget).toBeNull()

    const overridden = subjectsRepo.updateSubject(db, created.id, { customMinTarget: 60 })
    expect(overridden.customMinTarget).toBe(60)

    const clearedBackToDefault = subjectsRepo.updateSubject(db, created.id, { customMinTarget: null })
    expect(clearedBackToDefault.customMinTarget).toBeNull()
  })
})

describe('timetable slots repository', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('scopes slots by semester and finds a slot by day/period', () => {
    const subject = subjectsRepo.createSubject(db, {
      name: 'Algorithms',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })

    timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2026-1',
      day: 'mon',
      period: 1,
      subjectId: subject.id,
      type: 'class',
      startTime: null,
      endTime: null,
    })
    timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2025-2',
      day: 'mon',
      period: 1,
      subjectId: subject.id,
      type: 'class',
      startTime: null,
      endTime: null,
    })

    expect(timetableSlotsRepo.listTimetableSlots(db, { semester: '2026-1' })).toHaveLength(1)
    const found = timetableSlotsRepo.findSlot(db, { semester: '2026-1', day: 'mon', period: 1 })
    expect(found?.subjectId).toBe(subject.id)
  })

  it('cascades subject deletion to its timetable slots', () => {
    const subject = subjectsRepo.createSubject(db, {
      name: 'Networks',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })
    const slot = timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2026-1',
      day: 'tue',
      period: 2,
      subjectId: subject.id,
      type: 'class',
      startTime: null,
      endTime: null,
    })

    subjectsRepo.deleteSubject(db, subject.id)
    expect(timetableSlotsRepo.getTimetableSlot(db, slot.id)).toBeUndefined()
  })

  it('assigning the same semester/day/period twice updates the slot instead of duplicating it', () => {
    const subjectA = subjectsRepo.createSubject(db, {
      name: 'A',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })
    const subjectB = subjectsRepo.createSubject(db, {
      name: 'B',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })

    const first = timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2026-1',
      day: 'mon',
      period: 1,
      subjectId: subjectA.id,
      type: 'class',
      startTime: null,
      endTime: null,
    })
    const second = timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2026-1',
      day: 'mon',
      period: 1,
      subjectId: subjectB.id,
      type: 'meeting',
      startTime: null,
      endTime: null,
    })

    expect(second.id).toBe(first.id)
    expect(second.subjectId).toBe(subjectB.id)
    expect(second.type).toBe('meeting')
    expect(timetableSlotsRepo.listTimetableSlots(db, { semester: '2026-1' })).toHaveLength(1)
  })
})

describe('attendance records repository', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('filters records by subject and date range', () => {
    const subject = subjectsRepo.createSubject(db, {
      name: 'DBMS',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })

    attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-01-10',
      period: 1,
      status: 'present',
      source: 'manual',
      slotId: null,
    })
    attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-02-10',
      period: 1,
      status: 'absent',
      source: 'manual',
      slotId: null,
    })

    expect(attendanceRecordsRepo.listAttendanceRecords(db, { subjectId: subject.id })).toHaveLength(2)
    expect(
      attendanceRecordsRepo.listAttendanceRecords(db, {
        subjectId: subject.id,
        dateFrom: '2026-02-01',
        dateTo: '2026-02-28',
      }),
    ).toHaveLength(1)
  })

  it('updates and deletes a record', () => {
    const subject = subjectsRepo.createSubject(db, {
      name: 'OS',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })
    const record = attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-01-10',
      period: 1,
      status: 'absent',
      source: 'manual',
      slotId: null,
    })

    const updated = attendanceRecordsRepo.updateAttendanceRecord(db, record.id, { status: 'present' })
    expect(updated.status).toBe('present')

    attendanceRecordsRepo.deleteAttendanceRecord(db, record.id)
    expect(attendanceRecordsRepo.getAttendanceRecord(db, record.id)).toBeUndefined()
  })

  it('marking the same subject/date/period twice updates the record instead of duplicating it', () => {
    const subject = subjectsRepo.createSubject(db, {
      name: 'Networks',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })

    const first = attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-01-10',
      period: 1,
      status: 'absent',
      source: 'manual',
      slotId: null,
    })
    const second = attendanceRecordsRepo.createAttendanceRecord(db, {
      subjectId: subject.id,
      date: '2026-01-10',
      period: 1,
      status: 'present',
      source: 'manual',
      slotId: null,
    })

    expect(second.id).toBe(first.id)
    expect(second.status).toBe('present')
    expect(attendanceRecordsRepo.listAttendanceRecords(db, { subjectId: subject.id })).toHaveLength(1)
  })
})

// Part A audit (see the same bug class fixed in bunkmate-web's Analytics
// work): AttendanceRecordFilter has no semester concept — a listAttendanceRecords
// call with no filter (or a date-range-only filter) returns records for
// every semester's subjects at once. use-attendance.ts, planner.tsx, and
// analytics.tsx all read from that same unscoped store, so bySubject/
// aggregateOverall have to be scoped to the active semester's subjects
// after the fetch, via scopeRecordsToSubjects — this proves both that the
// raw fetch really does leak and that the fix eliminates it.
describe('cross-semester attendance-record leakage (Part A audit)', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('an unfiltered fetch leaks another semester\'s subject, and scopeRecordsToSubjects removes it', () => {
    const physics = subjectsRepo.createSubject(db, {
      name: 'Physics',
      semester: '2025-2',
      credits: 4,
      faculty: null,
      category: null,
    })
    const chemistry = subjectsRepo.createSubject(db, {
      name: 'Chemistry',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })

    // Chemistry (semester 2026-1, the one being viewed): 3 present, 1 absent.
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: chemistry.id, date: '2026-02-01', period: 1, status: 'present', source: 'manual', slotId: null })
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: chemistry.id, date: '2026-02-02', period: 1, status: 'present', source: 'manual', slotId: null })
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: chemistry.id, date: '2026-02-03', period: 1, status: 'present', source: 'manual', slotId: null })
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: chemistry.id, date: '2026-02-04', period: 1, status: 'absent', source: 'manual', slotId: null })
    // Physics (semester 2025-2, a different semester) — its window overlaps
    // 2026-1's, e.g. a late-logged makeup class. Both absent, so if it
    // leaks in it drags the overall percentage down.
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: physics.id, date: '2026-01-28', period: 2, status: 'absent', source: 'manual', slotId: null })
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: physics.id, date: '2026-01-29', period: 2, status: 'absent', source: 'manual', slotId: null })

    // Exactly the shape use-attendance.ts's loadRecords() calls (no filter
    // at all — the store fetches everything, unconditionally).
    const rawRecords = attendanceRecordsRepo.listAttendanceRecords(db, {})

    // 1. Prove the leakage is real: the raw response contains Physics
    //    (a different semester's subject) alongside Chemistry.
    const rawSubjectIds = new Set(rawRecords.map((r) => r.subjectId))
    expect(rawSubjectIds.has(physics.id)).toBe(true)
    expect(rawSubjectIds.has(chemistry.id)).toBe(true)

    const pollutedOverall = aggregateOverall(
      computeAttendance({ records: rawRecords, slots: [], holidays: [], yellowForms: [], rules: [] }),
    )
    // Correct (Chemistry only) would be 75%; Physics leaking in drags it down.
    expect(pollutedOverall.total).toBe(6)
    expect(pollutedOverall.attended).toBe(3)
    expect(pollutedOverall.percentage).toBe(50)

    // 2. Apply the fix (what use-attendance.ts / planner.tsx / analytics.tsx
    //    now do) and confirm Physics is gone and the percentage matches
    //    Chemistry alone.
    const scoped = scopeRecordsToSubjects(rawRecords, [chemistry.id])
    expect(scoped.every((r) => r.subjectId === chemistry.id)).toBe(true)
    expect(scoped).toHaveLength(4)

    const correctOverall = aggregateOverall(
      computeAttendance({ records: scoped, slots: [], holidays: [], yellowForms: [], rules: [] }),
    )
    expect(correctOverall.total).toBe(4)
    expect(correctOverall.attended).toBe(3)
    expect(correctOverall.percentage).toBe(75)
  })
})

describe('holidays repository', () => {
  it('creates, updates, and deletes a holiday, enforcing unique dates', () => {
    const db = createTestDb()
    const holiday = holidaysRepo.createHoliday(db, { date: '2026-01-26', type: 'public', label: 'Republic Day' })
    expect(holidaysRepo.listHolidays(db)).toHaveLength(1)

    expect(() => holidaysRepo.createHoliday(db, { date: '2026-01-26', type: 'custom', label: null })).toThrow()

    const updated = holidaysRepo.updateHoliday(db, holiday.id, { label: 'Republic Day (updated)' })
    expect(updated.label).toBe('Republic Day (updated)')

    holidaysRepo.deleteHoliday(db, holiday.id)
    expect(holidaysRepo.listHolidays(db)).toHaveLength(0)
  })
})

describe('leave plans repository', () => {
  it('stores a JSON array of dates', () => {
    const db = createTestDb()
    const plan = leavePlansRepo.createLeavePlan(db, {
      label: 'Family trip',
      dates: ['2026-03-01', '2026-03-02'],
      status: 'planned',
    })
    expect(plan.dates).toEqual(['2026-03-01', '2026-03-02'])

    const cancelled = leavePlansRepo.updateLeavePlan(db, plan.id, { status: 'cancelled' })
    expect(cancelled.status).toBe('cancelled')

    leavePlansRepo.deleteLeavePlan(db, plan.id)
    expect(leavePlansRepo.listLeavePlans(db)).toHaveLength(0)
  })
})

describe('yellow forms repository', () => {
  it('defaults new forms to pending and supports status transitions', () => {
    const db = createTestDb()
    const subject = subjectsRepo.createSubject(db, {
      name: 'Compilers',
      semester: '2026-1',
      credits: 3,
      faculty: null,
      category: null,
    })

    const form = yellowFormsRepo.createYellowForm(db, {
      date: '2026-01-15',
      subjectId: subject.id,
      period: 2,
      reason: 'Medical',
    })
    expect(form.status).toBe('pending')

    const approved = yellowFormsRepo.setYellowFormStatus(db, form.id, 'approved')
    expect(approved.status).toBe('approved')

    expect(yellowFormsRepo.listYellowForms(db, { subjectId: subject.id })).toHaveLength(1)

    yellowFormsRepo.deleteYellowForm(db, form.id)
    expect(yellowFormsRepo.listYellowForms(db)).toHaveLength(0)
  })

  it('files a dispute against a decided form, logs it, and resolves it through their own actions — never a generic edit', () => {
    const db = createTestDb()
    const subject = subjectsRepo.createSubject(db, { name: 'Compilers', semester: '2026-1', credits: 3, faculty: null, category: null })
    const form = yellowFormsRepo.createYellowForm(db, { date: '2026-01-15', subjectId: subject.id, period: 2, reason: 'Medical' })

    // Can't dispute a still-pending form.
    expect(() => yellowFormsRepo.fileYellowFormDispute(db, form.id, 'Not fair')).toThrow(/approved or rejected/)

    yellowFormsRepo.setYellowFormStatus(db, form.id, 'rejected')
    const disputed = yellowFormsRepo.fileYellowFormDispute(db, form.id, 'I had a doctor\'s note')
    expect(disputed.disputeStatus).toBe('disputed')
    expect(disputed.status).toBe('rejected') // filing a dispute never touches the underlying decision

    const dispute = yellowFormsRepo.getYellowFormDispute(db, form.id)
    expect(dispute?.note).toBe("I had a doctor's note")
    expect(dispute?.outcome).toBeNull()
    expect(dispute?.resolvedAt).toBeNull()

    // Can't file a second dispute on the same form.
    expect(() => yellowFormsRepo.fileYellowFormDispute(db, form.id, 'again')).toThrow(/already has a dispute/)

    const resolved = yellowFormsRepo.resolveYellowFormDispute(db, form.id, 'overturned')
    expect(resolved.disputeStatus).toBe('resolved')
    expect(resolved.status).toBe('rejected') // resolving a dispute doesn't itself flip the decision

    const resolvedDispute = yellowFormsRepo.getYellowFormDispute(db, form.id)
    expect(resolvedDispute?.outcome).toBe('overturned')
    expect(resolvedDispute?.resolvedAt).not.toBeNull()

    // Can't resolve an already-resolved dispute again.
    expect(() => yellowFormsRepo.resolveYellowFormDispute(db, form.id, 'upheld')).toThrow(/already been resolved/)
  })

  it('resolving without a filed dispute is rejected', () => {
    const db = createTestDb()
    const subject = subjectsRepo.createSubject(db, { name: 'Compilers', semester: '2026-1', credits: 3, faculty: null, category: null })
    const form = yellowFormsRepo.createYellowForm(db, { date: '2026-01-15', subjectId: subject.id, period: 2, reason: null })
    yellowFormsRepo.setYellowFormStatus(db, form.id, 'approved')
    expect(() => yellowFormsRepo.resolveYellowFormDispute(db, form.id, 'upheld')).toThrow(/No dispute on record/)
  })
})

describe('period type rules repository', () => {
  it('seeds every known period type with its default bucket on first run', () => {
    const db = createTestDb()
    expect(periodTypeRulesRepo.listPeriodTypeRules(db)).toEqual([])

    const seeded = periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)
    const byType = new Map(seeded.map((r) => [r.type, r.bucket]))
    expect(byType.get('class')).toBe('normal')
    expect(byType.get('project')).toBe('project')
    // Mentoring hours don't count toward attendance (user preference) — treated
    // like meetings, so its default bucket is 'excluded'.
    expect(byType.get('mentoring')).toBe('excluded')
    expect(byType.get('minor')).toBe('project')
    expect(byType.get('meeting')).toBe('excluded')
    expect(byType.get('lunch')).toBe('ignored')
    expect(seeded.map((r) => r.type).sort()).toEqual([...PERIOD_TYPES].sort())
  })

  it('is idempotent and never overwrites a bucket a user has already customized', () => {
    const db = createTestDb()
    periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)

    // A user reassigns 'meeting' from its default 'excluded' to 'normal'.
    periodTypeRulesRepo.setPeriodTypeRuleBucket(db, 'meeting', 'normal')

    // Re-running the seeder (as happens on every app start) must not stomp
    // that customization back to the default.
    const rules = periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)
    expect(rules.find((r) => r.type === 'meeting')?.bucket).toBe('normal')
    expect(rules).toHaveLength(PERIOD_TYPES.length)
  })

  it('backfills only newly-added period types without touching existing rows', () => {
    const db = createTestDb()
    periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)
    periodTypeRulesRepo.setPeriodTypeRuleBucket(db, 'class', 'excluded')

    // Simulate a type that predates a migration by deleting one row, then
    // confirm re-seeding restores just that row at its default — and still
    // leaves the customized 'class' row alone.
    db.delete(schema.periodTypeRules).where(eq(schema.periodTypeRules.type, 'lunch')).run()
    const rules = periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)
    expect(rules.find((r) => r.type === 'lunch')?.bucket).toBe('ignored')
    expect(rules.find((r) => r.type === 'class')?.bucket).toBe('excluded')
  })
})

describe('semesters repository', () => {
  let db: AppDatabase
  beforeEach(() => {
    db = createTestDb()
  })

  it('rolls over subjects + timetable into a NEW semester as independent copies', () => {
    semestersRepo.createSemester(db, {
      number: 1, label: '2026-1', startDate: '2026-01-01', endDate: '2026-05-01',
      periodsPerDay: 7, lunchPeriod: 4, isActive: true,
    })
    const ds = subjectsRepo.createSubject(db, { name: 'Data Structures', semester: '2026-1', credits: 4, faculty: 'Dr. A', category: 'core' })
    timetableSlotsRepo.createTimetableSlot(db, { semester: '2026-1', day: 'mon', period: 1, subjectId: ds.id, type: 'class', startTime: null, endTime: null })
    timetableSlotsRepo.createTimetableSlot(db, { semester: '2026-1', day: 'mon', period: 4, subjectId: null, type: 'lunch', startTime: null, endTime: null })
    attendanceRecordsRepo.createAttendanceRecord(db, { subjectId: ds.id, date: '2026-02-01', period: 1, status: 'present', source: 'manual', slotId: null })

    const preview = semestersRepo.getRolloverPreview(db, '2026-1')
    expect(preview.subjects.map((s) => s.name)).toEqual(['Data Structures'])
    expect(preview.slotCount).toBe(2)

    const rolled = semestersRepo.createSemesterWithRollover(
      db,
      { number: 2, label: '2026-2', startDate: '2026-06-01', endDate: '2026-10-01', periodsPerDay: 7, lunchPeriod: 4, isActive: false },
      '2026-1',
    )

    // New subject rows with fresh ids, referenced by the new slots.
    const newSubjects = subjectsRepo.listSubjects(db, { semester: '2026-2' })
    expect(newSubjects).toHaveLength(1)
    const newDs = newSubjects[0]
    expect(newDs.id).not.toBe(ds.id)
    expect(newDs.name).toBe('Data Structures')
    expect(newDs.faculty).toBe('Dr. A')

    const newSlots = timetableSlotsRepo.listTimetableSlots(db, { semester: '2026-2' })
    expect(newSlots).toHaveLength(2)
    const newClassSlot = newSlots.find((s) => s.type === 'class')!
    expect(newClassSlot.subjectId).toBe(newDs.id) // points at the NEW subject, not the old one
    expect(newClassSlot.subjectId).not.toBe(ds.id)

    // Nothing else copied: attendance stays with the old semester only.
    expect(attendanceRecordsRepo.listAttendanceRecords(db, { subjectId: newDs.id })).toHaveLength(0)

    // Editing the new subject must not touch the old one (true independence).
    subjectsRepo.updateSubject(db, newDs.id, { name: 'DS (renamed)' })
    expect(subjectsRepo.getSubject(db, ds.id)?.name).toBe('Data Structures')
    expect(rolled.label).toBe('2026-2')
  })

  it('creates, lists, updates, and archives a semester', () => {
    const created = semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 7,
      lunchPeriod: 4,
      isActive: false,
    })
    expect(created.archived).toBe(false)
    expect(semestersRepo.listSemesters(db)).toHaveLength(1)

    const updated = semestersRepo.updateSemester(db, created.id, { periodsPerDay: 8 })
    expect(updated.periodsPerDay).toBe(8)

    const archived = semestersRepo.setSemesterArchived(db, created.id, true)
    expect(archived.archived).toBe(true)
  })

  it('setting a semester active deactivates the others and syncs settings.currentSemester', () => {
    const first = semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 7,
      lunchPeriod: 4,
      isActive: true,
    })
    const second = semestersRepo.createSemester(db, {
      number: 2,
      label: '2026-2',
      startDate: '2026-06-01',
      endDate: '2026-12-01',
      periodsPerDay: 7,
      lunchPeriod: 4,
      isActive: true,
    })

    expect(semestersRepo.getSemester(db, first.id)?.isActive).toBe(false)
    expect(semestersRepo.getSemester(db, second.id)?.isActive).toBe(true)
    expect(settingsRepo.getSettings(db).currentSemester).toBe('2026-2')

    semestersRepo.updateSemester(db, first.id, { isActive: true })
    expect(semestersRepo.getSemester(db, first.id)?.isActive).toBe(true)
    expect(semestersRepo.getSemester(db, second.id)?.isActive).toBe(false)
    expect(settingsRepo.getSettings(db).currentSemester).toBe('2026-1')
  })

  it('archiving the active semester clears its active flag', () => {
    const semester = semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 7,
      lunchPeriod: 4,
      isActive: true,
    })
    const archived = semestersRepo.setSemesterArchived(db, semester.id, true)
    expect(archived.archived).toBe(true)
    expect(archived.isActive).toBe(false)
  })

  it('blocks deletion while subjects or timetable slots still reference the semester, and allows it once cleared', () => {
    const semester = semestersRepo.createSemester(db, {
      number: 1,
      label: '2026-1',
      startDate: '2026-01-01',
      endDate: '2026-05-01',
      periodsPerDay: 7,
      lunchPeriod: 4,
      isActive: false,
    })
    const subject = subjectsRepo.createSubject(db, {
      name: 'Data Structures',
      semester: '2026-1',
      credits: 4,
      faculty: null,
      category: null,
    })
    timetableSlotsRepo.createTimetableSlot(db, {
      semester: '2026-1',
      day: 'mon',
      period: 1,
      subjectId: subject.id,
      type: 'class',
      startTime: null,
      endTime: null,
    })

    expect(semestersRepo.getSemesterDependents(db, '2026-1')).toEqual({ subjects: 1, timetableSlots: 1 })
    expect(() => semestersRepo.deleteSemester(db, semester.id)).toThrow(/subject.*timetable slot/)
    expect(semestersRepo.listSemesters(db)).toHaveLength(1)

    subjectsRepo.deleteSubject(db, subject.id)
    semestersRepo.deleteSemester(db, semester.id)
    expect(semestersRepo.listSemesters(db)).toHaveLength(0)
  })

  it('seeds semesters from pre-existing free-text semester values exactly once', () => {
    subjectsRepo.createSubject(db, {
      name: 'Data Structures',
      semester: '2025-2',
      credits: 4,
      faculty: null,
      category: null,
    })
    settingsRepo.updateSettings(db, { currentSemester: '2026-1' })

    semestersRepo.ensureSemestersSeeded(db)
    const seeded = semestersRepo.listSemesters(db)
    expect(seeded.map((s) => s.label).sort()).toEqual(['2025-2', '2026-1'])
    expect(seeded.find((s) => s.label === '2026-1')?.isActive).toBe(true)
    expect(seeded.find((s) => s.label === '2025-2')?.isActive).toBe(false)

    // Re-running is a no-op since semesters already exist.
    semestersRepo.ensureSemestersSeeded(db)
    expect(semestersRepo.listSemesters(db)).toHaveLength(2)
  })

  it('does not seed anything on a fresh install with no existing semester data', () => {
    semestersRepo.ensureSemestersSeeded(db)
    expect(semestersRepo.listSemesters(db)).toHaveLength(0)
  })
})

describe('settings repository', () => {
  it('ensures a singleton row with defaults and persists updates to both targets independently', () => {
    const db = createTestDb()
    const settings = settingsRepo.getSettings(db)
    expect(settings.id).toBe(1)
    expect(settings.overallMinTarget).toBe(75)
    expect(settings.subjectMinTarget).toBe(75)

    const updated = settingsRepo.updateSettings(db, {
      overallMinTarget: 80,
      subjectMinTarget: 70,
      currentSemester: '2026-1',
    })
    expect(updated.overallMinTarget).toBe(80)
    expect(updated.subjectMinTarget).toBe(70)
    expect(updated.currentSemester).toBe('2026-1')

    // A second ensure/get call must not create a duplicate row.
    settingsRepo.ensureSettingsRow(db)
    expect(settingsRepo.getSettings(db).overallMinTarget).toBe(80)
    expect(settingsRepo.getSettings(db).subjectMinTarget).toBe(70)
  })
})
