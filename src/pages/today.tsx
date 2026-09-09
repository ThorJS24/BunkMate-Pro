import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileWarning } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { QuickImpactPredictor } from '@/components/quick-impact-predictor'
import { useSettingsStore } from '@/store/settings-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useExamsStore } from '@/store/exams-store'
import { useAttendance } from '@/hooks/use-attendance'
import { useDayMarking } from '@/hooks/use-day-marking'
import { jsDayToWeekday, detectContinuousAbsence } from '@/lib/attendance-engine'
import { resolveDayPeriods, buildPeriodEndMinutesForDay, minutesSinceMidnight } from '@/lib/day-attendance'
import { todayIso } from '@/lib/date-utils'
import { NON_ATTENDANCE_TYPES } from '@/lib/period-marking'
import { cn } from '@/lib/utils'


export function TodayPage() {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { slots, load: loadSlots } = useTimetableStore()
  const { records, load: loadRecords } = useAttendanceStore()
  const { holidays, load: loadHolidays } = useHolidaysStore()
  const { exams, load: loadExams } = useExamsStore()
  const { overall } = useAttendance(currentSemester || null)
  const { toggle } = useDayMarking()

  const today = todayIso()

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadRecords()
    loadHolidays()
  }, [loadSubjects, loadRecords, loadHolidays])

  useEffect(() => {
    if (currentSemester) {
      loadSlots(currentSemester)
      loadExams({ semester: currentSemester })
    }
  }, [loadSlots, loadExams, currentSemester])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const todayHoliday = holidays.find((h) => h.date === today && h.type !== 'working_saturday')
  const todayExams = useMemo(() => exams.filter((e) => e.date === today), [exams, today])

  // Per CHRIST's handbook: 2+ continuous weeks with no attendance is treated
  // as withdrawal. Scoped to the current semester's subjects, same as the
  // Overall bar above.
  const continuousAbsence = useMemo(() => {
    const semesterSubjectIds = new Set(subjects.filter((s) => s.semester === currentSemester).map((s) => s.id))
    const semesterRecords = records.filter((r) => semesterSubjectIds.has(r.subjectId))
    return detectContinuousAbsence({ records: semesterRecords, todayIso: today })
  }, [subjects, records, currentSemester, today])

  const dayPeriods = useMemo(() => {
    const weekday = jsDayToWeekday(today)
    if (!weekday) return []
    const daySlots = slots.filter((s) => s.day === weekday)
    const dayRecords = records.filter((r) => r.date === today)
    const periodEndMinutes = buildPeriodEndMinutesForDay(slots, weekday)
    return resolveDayPeriods({
      scheduledPeriods: daySlots.map((s) => ({
        date: today,
        day: weekday,
        period: s.period,
        subjectId: s.subjectId,
        type: s.type,
        slotId: s.id,
      })),
      records: dayRecords,
      todayIso: today,
      nowMinutes: minutesSinceMidnight(new Date()),
      periodEndMinutes,
    }).sort((a, b) => a.period - b.period)
  }, [slots, records, today])

  const markable = dayPeriods.filter((p) => !NON_ATTENDANCE_TYPES.includes(p.type) && p.subjectId !== null)

  // Quick-mark: digit N marks the Nth class below present, Shift+N marks it
  // absent — so a full day can be marked without ever reaching for the
  // mouse. Kept local to this page (not the global "g"-leader shortcuts)
  // since it only makes sense while looking at today's actual list.
  const markableRef = useRef(markable)
  markableRef.current = markable
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return
      if (!/^[1-9]$/.test(e.key)) return

      const period = markableRef.current[Number(e.key) - 1]
      if (!period || period.subjectId === null) return
      e.preventDefault()
      toggle(today, period.subjectId, period.slotId, e.shiftKey ? 'absent' : 'present')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggle, today])

  const markedCount = markable.filter(
    (p) => p.effectiveStatus === 'present' || p.effectiveStatus === 'absent' || p.effectiveStatus === 'auto_present',
  ).length

  const dateLabel = new Date(`${today}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  })

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <SemesterSwitcher />
      </div>

      <OnboardingChecklist />

      <QuickImpactPredictor />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-card p-3 text-sm">
        <span className="font-medium">Overall</span>
        <span className={cn('tabular-nums', overall.percentage !== null && overall.percentage < overallMinTarget ? 'text-destructive' : 'text-success')}>
          {overall.percentage === null ? '—' : `${overall.percentage.toFixed(1)}%`}
        </span>
        <Progress value={overall.percentage ?? 0} className="h-2 flex-1" />
        {markable.length > 0 && (
          <span className="text-xs text-muted-foreground">
            {markedCount}/{markable.length} marked
          </span>
        )}
      </div>

      {continuousAbsence.flagged && (
        <Card className="border-destructive/50 bg-destructive/10">
          <CardContent className="flex items-start gap-2 p-3 text-sm">
            <FileWarning className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span>
              You haven't been marked present in any class for{' '}
              <span className="font-medium">{continuousAbsence.daysSinceLastPresent} days</span>. Per the University
              handbook, two or more continuous weeks of absence without written approval can be treated as
              withdrawal — if this isn't right, check your recent records or sync with{' '}
              <Link to="/attendance" className="underline">
                ESPRO
              </Link>
              .
            </span>
          </CardContent>
        </Card>
      )}

      {todayExams.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
            <FileWarning className="size-4 text-destructive" />
            <span className="font-medium">Exam today:</span>
            {todayExams.map((e) => (
              <span key={e.id}>
                {e.name}
                {e.subjectId && subjectsById.get(e.subjectId) && (
                  <span className="text-muted-foreground"> ({subjectsById.get(e.subjectId)?.name})</span>
                )}
              </span>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Classes</CardTitle>
          <CardDescription>
            Tap present or absent for each, same records the rest of the app uses.
            {markable.length > 0 && ' Or press a number key to mark present, Shift+number for absent.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {todayHoliday && (
            <Badge variant="warning">Holiday: {todayHoliday.label ?? todayHoliday.type}</Badge>
          )}
          {!todayHoliday && dayPeriods.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {currentSemester ? 'No classes scheduled today. Enjoy the break.' : 'No active semester set.'}
            </p>
          )}
          {!todayHoliday &&
            dayPeriods.map((p) => {
              const subjectName = p.subjectId ? subjectsById.get(p.subjectId)?.name : undefined
              const isLunch = p.type === 'lunch'
              const canMark = !NON_ATTENDANCE_TYPES.includes(p.type) && p.subjectId !== null
              const record = records.find((r) => r.date === today && r.subjectId === p.subjectId && r.period === p.period)
              const autoPresent = p.effectiveStatus === 'auto_present'
              const quickMarkNumber = canMark ? markable.indexOf(p) + 1 : 0
              return (
                <div
                  key={p.slotId}
                  className={cn('flex items-center justify-between gap-2 rounded-md border p-2', isLunch && 'opacity-60')}
                >
                  <span className="flex items-center gap-2 text-sm">
                    {quickMarkNumber > 0 && quickMarkNumber <= 9 && (
                      <span className="flex size-4 shrink-0 items-center justify-center rounded border font-mono text-[10px] text-muted-foreground">
                        {quickMarkNumber}
                      </span>
                    )}
                    <span className="font-medium">P{p.period}</span>
                    <span>{subjectName ?? p.type}</span>
                    {autoPresent && (
                      <Badge variant="outline" className="text-[10px]">
                        Auto-present
                      </Badge>
                    )}
                    {p.effectiveStatus === 'upcoming' && (
                      <Badge variant="secondary" className="text-[10px]">
                        Upcoming
                      </Badge>
                    )}
                  </span>
                  {canMark ? (
                    <div className="flex gap-1">
                      <Button
                        size="sm"
                        variant={record?.status === 'present' || autoPresent ? 'default' : 'outline'}
                        onClick={() => toggle(today, p.subjectId as number, p.slotId, 'present')}
                      >
                        <CheckCircle2 className="size-4" /> Present
                      </Button>
                      <Button
                        size="sm"
                        variant={record?.status === 'absent' ? 'destructive' : 'outline'}
                        onClick={() => toggle(today, p.subjectId as number, p.slotId, 'absent')}
                      >
                        Absent
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">{isLunch ? 'Lunch' : 'Not tracked'}</span>
                  )}
                </div>
              )
            })}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        Want the full picture? Open the <Link to="/dashboard" className="underline">Dashboard</Link>.
      </p>
    </div>
  )
}
