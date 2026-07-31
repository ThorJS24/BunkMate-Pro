import { useEffect, useMemo, useState } from 'react'
import { useAttendanceStore } from '@/store/attendance-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { usePeriodTypeRulesStore } from '@/store/period-type-rules-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useSubjectsStore } from '@/store/subjects-store'
import {
  computeAttendance,
  aggregateOverall,
  jsDayToWeekday,
  enumerateScheduledPeriods,
  type SubjectAttendance,
} from '@/lib/attendance-engine'
import { autoPresentRecords, buildPeriodEndMinutesForDay, minutesSinceMidnight } from '@/lib/day-attendance'
import { scopeRecordsToSubjects } from '@/lib/semester-scope'
import { computeStreaksBySubject } from '@/lib/insights'
import { todayIso, nextDayIso } from '@/lib/date-utils'

export interface UseAttendanceResult {
  bySubject: Map<number, SubjectAttendance>
  overall: ReturnType<typeof aggregateOverall>
  /** Current present-streak per subject (from logged records). */
  streaksBySubject: Map<number, number>
  /** Longest current present-streak across all subjects — the headline
   * number for a "you're on a roll" nudge. */
  bestStreak: number
  /** Scheduled (non-holiday) periods still to come between tomorrow and the
   * semester's end, per subject and in total — feeds end-of-term projection. */
  remainingBySubject: Map<number, number>
  remainingOverall: number
  /** Remaining scheduled session dates per subject, chronological — feeds the
   * recovery plan ("attend these exact dates"). */
  futureDatesBySubject: Map<number, string[]>
  /** This semester's logged records grouped by subject — feeds sparklines
   * without every caller re-deriving the semester scoping. */
  recordsBySubject: Map<number, { subjectId: number; date: string; period: number; status: 'present' | 'absent' }[]>
  loading: boolean
}

/**
 * Loads every input the attendance engine needs and recomputes live stats
 * whenever any of it changes. `semester` scopes which timetable slots feed
 * the engine's period-type lookups; attendance records, holidays, yellow
 * forms, and rules are otherwise global.
 */
export function useAttendance(semester: string | null): UseAttendanceResult {
  const records = useAttendanceStore((s) => s.records)
  const loadRecords = useAttendanceStore((s) => s.load)
  const recordsLoading = useAttendanceStore((s) => s.loading)

  const slots = useTimetableStore((s) => s.slots)
  const loadSlots = useTimetableStore((s) => s.load)

  const holidays = useHolidaysStore((s) => s.holidays)
  const loadHolidays = useHolidaysStore((s) => s.load)

  const yellowForms = useYellowFormsStore((s) => s.forms)
  const loadYellowForms = useYellowFormsStore((s) => s.load)

  const rules = usePeriodTypeRulesStore((s) => s.rules)
  const loadRules = usePeriodTypeRulesStore((s) => s.load)

  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)

  // Subjects carry the `semester` text field that's the only way to scope
  // attendance records to "this semester" — AttendanceRecordFilter has no
  // semester concept (see electron/db/repositories/attendance-records.ts),
  // so records are scoped below by intersecting with this semester's
  // subject ids, not trusted from whatever a caller last loaded.
  const subjects = useSubjectsStore((s) => s.subjects)
  const loadSubjects = useSubjectsStore((s) => s.load)

  useEffect(() => {
    loadRecords()
    loadHolidays()
    loadYellowForms()
    loadRules()
    loadSemesters()
    loadSubjects({ includeArchived: false })
  }, [loadRecords, loadHolidays, loadYellowForms, loadRules, loadSemesters, loadSubjects])

  useEffect(() => {
    if (semester) loadSlots(semester)
  }, [loadSlots, semester])

  const semesterSubjectIds = useMemo(
    () => subjects.filter((s) => s.semester === semester).map((s) => s.id),
    [subjects, semester],
  )
  const scopedRecords = useMemo(
    () => scopeRecordsToSubjects(records, semesterSubjectIds),
    [records, semesterSubjectIds],
  )

  // A class crossing its end-time should flip to auto-present without the
  // user having to touch anything else first, so re-read "now" every minute.
  const [nowMinutes, setNowMinutes] = useState(() => minutesSinceMidnight(new Date()))
  useEffect(() => {
    const id = setInterval(() => setNowMinutes(minutesSinceMidnight(new Date())), 60_000)
    return () => clearInterval(id)
  }, [])

  const bySubject = useMemo(() => {
    const today = todayIso()
    const weekday = jsDayToWeekday(today)
    const periodEndMinutes = weekday ? buildPeriodEndMinutesForDay(slots, weekday) : new Map()

    // Auto-present applies to every unmarked scheduled period whose time has
    // passed, not just today's (see day-attendance.ts) — so this has to
    // enumerate from the semester's start, not just look at "today".
    const activeSemester = semesters.find((s) => s.label === semester)
    const startDate = activeSemester && activeSemester.startDate <= today ? activeSemester.startDate : today
    const scheduledPeriods = enumerateScheduledPeriods({ slots, holidays, startDate, endDate: today })

    const autoPresent = autoPresentRecords({
      scheduledPeriods,
      records: scopedRecords,
      todayIso: today,
      nowMinutes,
      periodEndMinutes,
    })

    return computeAttendance({ records: [...scopedRecords, ...autoPresent], slots, holidays, yellowForms, rules })
  }, [scopedRecords, slots, holidays, yellowForms, rules, nowMinutes, semesters, semester])

  const overall = useMemo(() => aggregateOverall(bySubject), [bySubject])

  // Streaks run off the logged records only (not auto-present synthetics) —
  // a "present streak" should reflect classes actually recorded, and scoping
  // keeps other semesters out.
  const streaksBySubject = useMemo(
    () => computeStreaksBySubject(scopedRecords.map((r) => ({ subjectId: r.subjectId, date: r.date, period: r.period, status: r.status }))),
    [scopedRecords],
  )
  const bestStreak = useMemo(
    () => (streaksBySubject.size === 0 ? 0 : Math.max(...streaksBySubject.values())),
    [streaksBySubject],
  )

  // Remaining scheduled periods: tomorrow through the semester end, holiday-
  // excluded, per subject. Counts only slots that carry a subject (they're
  // the ones that can accrue attendance).
  const { remainingBySubject, remainingOverall, futureDatesBySubject } = useMemo(() => {
    const activeSemester = semesters.find((s) => s.label === semester)
    const today = todayIso()
    const bySubj = new Map<number, number>()
    const datesBySubj = new Map<number, string[]>()
    let total = 0
    if (activeSemester && activeSemester.endDate >= today) {
      const future = enumerateScheduledPeriods({
        slots,
        holidays,
        startDate: nextDayIso(today),
        endDate: activeSemester.endDate,
      })
      // enumerateScheduledPeriods already yields periods in date/period order.
      for (const p of future) {
        if (p.subjectId === null) continue
        bySubj.set(p.subjectId, (bySubj.get(p.subjectId) ?? 0) + 1)
        const list = datesBySubj.get(p.subjectId)
        if (list) list.push(p.date)
        else datesBySubj.set(p.subjectId, [p.date])
        total++
      }
    }
    return { remainingBySubject: bySubj, remainingOverall: total, futureDatesBySubject: datesBySubj }
  }, [semesters, semester, slots, holidays])

  const recordsBySubject = useMemo(() => {
    const map = new Map<number, { subjectId: number; date: string; period: number; status: 'present' | 'absent' }[]>()
    for (const r of scopedRecords) {
      const entry = { subjectId: r.subjectId, date: r.date, period: r.period, status: r.status }
      const list = map.get(r.subjectId)
      if (list) list.push(entry)
      else map.set(r.subjectId, [entry])
    }
    return map
  }, [scopedRecords])

  return {
    bySubject,
    overall,
    streaksBySubject,
    bestStreak,
    remainingBySubject,
    remainingOverall,
    futureDatesBySubject,
    recordsBySubject,
    loading: recordsLoading,
  }
}
