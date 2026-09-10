import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, FileWarning, GripVertical, RotateCcw } from 'lucide-react'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { QuickImpactPredictor } from '@/components/quick-impact-predictor'
import { BunkBudgetCard } from '@/components/bunk-budget-card'
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
import { useTodayLayoutStore, resolveTodayLayout } from '@/store/today-layout-store'

const GridLayout = WidthProvider(ReactGridLayout)

function TodayTile({ children, scrollable = true }: { children: ReactNode; scrollable?: boolean }) {
  return (
    <div className="group relative h-full w-full rounded-lg transition-all">
      <GripVertical className="drag-handle absolute right-2 top-2 z-20 size-4 cursor-grab active:cursor-grabbing text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className={cn('h-full w-full', scrollable ? 'overflow-auto' : 'overflow-hidden')}>{children}</div>
    </div>
  )
}

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
  const { layout: storedLayout, setLayout, resetLayout } = useTodayLayoutStore()

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

  const markableRef = useRef(markable)
  markableRef.current = markable
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLElement && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) return
      if (document.querySelector('[role="dialog"]')) return

      if ((e.ctrlKey || e.metaKey) && ['1', '2', '3'].includes(e.key)) {
        e.preventDefault()
        const activePeriod = markableRef.current.find((p) => p.effectiveStatus === null) || markableRef.current[0]
        if (!activePeriod || activePeriod.subjectId === null) return
        if (e.key === '1') toggle(today, activePeriod.subjectId, activePeriod.slotId, 'present')
        else if (e.key === '2') toggle(today, activePeriod.subjectId, activePeriod.slotId, 'absent')
        else if (e.key === '3') toggle(today, activePeriod.subjectId, activePeriod.slotId, 'present')
        return
      }

      if (e.ctrlKey || e.metaKey || e.altKey) return
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

  const layout = useMemo(() => resolveTodayLayout(storedLayout), [storedLayout])

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Today</h1>
          <p className="text-sm text-muted-foreground">{dateLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={resetLayout} title="Restore default layout arrangement">
            <RotateCcw className="size-4 mr-1.5" /> Reset layout
          </Button>
          <SemesterSwitcher />
        </div>
      </div>

      <GridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={36}
        margin={[12, 12]}
        draggableHandle=".drag-handle"
        resizeHandles={['se', 's', 'e', 'w', 'sw', 'nw', 'ne', 'n']}
        compactType="vertical"
        isResizable
        isDraggable
        onLayoutChange={setLayout}
      >
        <div key="onboarding">
          <TodayTile>
            <OnboardingChecklist />
          </TodayTile>
        </div>

        <div key="predictor">
          <TodayTile>
            <QuickImpactPredictor />
          </TodayTile>
        </div>

        <div key="bunk-budget">
          <TodayTile>
            <BunkBudgetCard targetPercentage={overallMinTarget} />
          </TodayTile>
        </div>

        <div key="overall-summary">
          <TodayTile>
            <div className="flex h-full flex-wrap items-center gap-3 rounded-lg border bg-card p-4 text-sm shadow-sm">
              <span className="font-semibold text-foreground">Overall Attendance</span>
              <span
                className={cn(
                  'tabular-nums font-mono font-bold text-base',
                  overall.percentage !== null && overall.percentage < overallMinTarget
                    ? 'text-destructive'
                    : 'text-success',
                )}
              >
                {overall.percentage === null ? '—' : `${overall.percentage.toFixed(1)}%`}
              </span>
              <Progress value={overall.percentage ?? 0} className="h-2 flex-1 min-w-[120px]" />
              {markable.length > 0 && (
                <Badge variant="outline" className="text-xs font-mono">
                  {markedCount}/{markable.length} marked
                </Badge>
              )}
            </div>
          </TodayTile>
        </div>

        <div key="alerts">
          <TodayTile scrollable>
            <div className="space-y-2">
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
                <Card className="border-amber-500/50 bg-amber-500/10">
                  <CardContent className="flex flex-wrap items-center gap-2 p-3 text-sm">
                    <FileWarning className="size-4 text-amber-600 dark:text-amber-400" />
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

              {!continuousAbsence.flagged && todayExams.length === 0 && (
                <div className="flex h-full items-center justify-center rounded-lg border border-dashed p-4 text-center text-xs text-muted-foreground">
                  No active status alerts today. All clear!
                </div>
              )}
            </div>
          </TodayTile>
        </div>

        <div key="classes">
          <TodayTile scrollable>
            <Card className="h-full flex flex-col justify-between">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-semibold">Today's Classes & Quick Logging</CardTitle>
                <CardDescription className="text-xs">
                  Tap Present or Absent. Quick hotkeys: Press number <kbd className="font-mono bg-muted px-1 rounded">1-9</kbd> for period N, or <kbd className="font-mono bg-muted px-1 rounded">Ctrl+1/2/3</kbd> for active class.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 overflow-y-auto flex-1">
                {todayHoliday && (
                  <Badge variant="warning">Holiday: {todayHoliday.label ?? todayHoliday.type}</Badge>
                )}
                {!todayHoliday && dayPeriods.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">
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
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm transition-colors hover:bg-accent/40',
                          isLunch && 'opacity-60 bg-muted/20',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          {quickMarkNumber > 0 && quickMarkNumber <= 9 && (
                            <span className="flex size-5 shrink-0 items-center justify-center rounded border bg-muted/50 font-mono text-xs text-muted-foreground">
                              {quickMarkNumber}
                            </span>
                          )}
                          <span className="font-semibold font-mono">P{p.period}</span>
                          <span className="font-medium text-foreground">{subjectName ?? p.type}</span>
                          {autoPresent && (
                            <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
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
                          <div className="flex gap-1.5">
                            <Button
                              size="sm"
                              variant={record?.status === 'present' || autoPresent ? 'default' : 'outline'}
                              onClick={() => toggle(today, p.subjectId as number, p.slotId, 'present')}
                            >
                              <CheckCircle2 className="size-4 mr-1" /> Present
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
                          <span className="text-xs text-muted-foreground italic">Non-attendance</span>
                        )}
                      </div>
                    )
                  })}
              </CardContent>
            </Card>
          </TodayTile>
        </div>
      </GridLayout>
    </div>
  )
}
