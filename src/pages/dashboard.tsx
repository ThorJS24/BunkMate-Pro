import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ShieldCheck, Flame, GripVertical, RotateCcw } from 'lucide-react'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Sparkline } from '@/components/ui/sparkline'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { EsproComparisonTable } from '@/components/espro-comparison-table'
import type { EsproStatus } from '../../electron/espro/types'
import type { AttendanceComparisonRow } from '../../electron/espro/attendance-totals'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useExamsStore } from '@/store/exams-store'
import { useAttendance } from '@/hooks/use-attendance'
import { computeSafeBunkCount, resolveSubjectMinTarget, jsDayToWeekday } from '@/lib/attendance-engine'
import { computeProjection, cumulativeAttendanceSeries, computeRecoveryPlan } from '@/lib/insights'
import { computeWeekShape } from '@/lib/timetable-week-shape'
import type { Weekday } from '@/db/schema'
import { todayIso, countdownLabel } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { useDashboardLayoutStore, resolveDashboardLayout } from '@/store/dashboard-layout-store'

const GridLayout = WidthProvider(ReactGridLayout)

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

function percentColor(percent: number | null, target: number, atRiskMarginPp: number): string {
  if (percent === null) return 'text-muted-foreground'
  if (percent < target) return 'text-destructive'
  if (atRiskMarginPp > 0 && percent < target + atRiskMarginPp) return 'text-warning'
  return 'text-success'
}

// Every tile on the grid gets the same drag handle in its top-right corner —
// `.drag-handle` is what draggableHandle targets, so clicking buttons/links
// inside a tile never accidentally starts a drag.
//
// `scrollable` is only for tiles with genuinely unbounded content (a list
// that grows with the semester's subject/exam/holiday count) — those keep an
// internal scrollbar as a fallback so more data is never silently clipped,
// but default tile heights are generous enough that it rarely engages.
// Everything else clips instead of scrolling, since a fixed handful of stats
// should never need it and a second, nested scrollbar inside an already-
// scrollable page is exactly the cluttered feel being fixed here.
function DashboardTile({ children, scrollable = false }: { children: ReactNode; scrollable?: boolean }) {
  return (
    <div className="group relative h-full">
      <GripVertical className="drag-handle absolute right-2 top-2 z-10 size-4 cursor-move text-muted-foreground/30 opacity-0 transition-opacity group-hover:opacity-100" />
      <div className={cn('h-full', scrollable ? 'overflow-auto' : 'overflow-hidden')}>{children}</div>
    </div>
  )
}

export function DashboardPage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const subjectMinTarget = useSettingsStore((s) => s.subjectMinTarget)
  const atRiskMarginPp = useSettingsStore((s) => s.atRiskMarginPp)
  const { holidays, load: loadHolidays } = useHolidaysStore()
  const { slots, load: loadSlots } = useTimetableStore()
  const { semesters, load: loadSemesters } = useSemestersStore()
  const { exams, load: loadExams } = useExamsStore()
  const { layout: storedLayout, setLayout, resetLayout } = useDashboardLayoutStore()

  const [esproStatus, setEsproStatus] = useState<EsproStatus | null>(null)
  const [esproComparing, setEsproComparing] = useState(false)
  const [esproRows, setEsproRows] = useState<AttendanceComparisonRow[] | null>(null)
  const [esproError, setEsproError] = useState<string | null>(null)

  const semester = currentSemester || null
  const {
    bySubject,
    overall,
    streaksBySubject,
    bestStreak,
    remainingBySubject,
    remainingOverall,
    futureDatesBySubject,
    recordsBySubject,
  } = useAttendance(semester)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadHolidays()
    loadSemesters()
    window.bunkmate.espro.getStatus().then(setEsproStatus).catch(() => setEsproStatus(null))
  }, [loadSubjects, loadHolidays, loadSemesters])

  async function handleCompareEspro() {
    if (!semester) return
    setEsproComparing(true)
    setEsproError(null)
    try {
      setEsproRows(await window.bunkmate.espro.compareAttendance(semester))
    } catch (err) {
      setEsproError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setEsproComparing(false)
    }
  }

  useEffect(() => {
    if (semester) {
      loadSlots(semester)
      loadExams({ semester })
    }
  }, [loadSlots, loadExams, semester])

  const today = todayIso()
  const todayWeekday = jsDayToWeekday(today)
  const todayHoliday = holidays.find((h) => h.date === today && h.type !== 'working_saturday')

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const todaysClasses = useMemo(() => {
    if (!todayWeekday) return []
    return slots
      .filter((s) => s.day === todayWeekday)
      .sort((a, b) => a.period - b.period)
      .map((s) => ({ ...s, subjectName: s.subjectId ? subjectsById.get(s.subjectId)?.name : undefined }))
  }, [slots, todayWeekday, subjectsById])

  const upcomingHolidays = useMemo(
    () =>
      holidays
        .filter((h) => h.date >= today)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(0, 5),
    [holidays, today],
  )

  const upcomingExams = useMemo(
    () =>
      exams
        .filter((e) => e.date >= today)
        .sort((a, b) => (a.date < b.date ? -1 : 1))
        .slice(0, 5),
    [exams, today],
  )

  const subjectRows = useMemo(
    () =>
      // Scope to the current semester's subjects — loadSubjects pulls every
      // semester's, so without this a subject of the same/other name from
      // another semester shows as an empty 0/0 row.
      subjects
        .filter((subject) => subject.semester === semester)
        .map((subject) => {
          const stats = bySubject.get(subject.id)
          const overallStats = stats?.overall ?? { total: 0, attended: 0, percentage: null }
          const resolvedTarget = resolveSubjectMinTarget(subject, subjectMinTarget)
          const safeBunks = computeSafeBunkCount(overallStats.attended, overallStats.total, resolvedTarget)
          const streak = streaksBySubject.get(subject.id) ?? 0
          const projection = computeProjection({
            attended: overallStats.attended,
            total: overallStats.total,
            remaining: remainingBySubject.get(subject.id) ?? 0,
            target: resolvedTarget,
          })
          const series = cumulativeAttendanceSeries(recordsBySubject.get(subject.id) ?? [])
          const recovery = computeRecoveryPlan({
            attended: overallStats.attended,
            total: overallStats.total,
            target: resolvedTarget,
            futureDates: futureDatesBySubject.get(subject.id) ?? [],
          })
          return { subject, stats, overallStats, resolvedTarget, safeBunks, streak, projection, series, recovery }
        })
        .sort((a, b) => (a.overallStats.percentage ?? 100) - (b.overallStats.percentage ?? 100)),
    [subjects, semester, bySubject, subjectMinTarget, streaksBySubject, remainingBySubject, futureDatesBySubject, recordsBySubject],
  )

  const belowTarget = subjectRows.filter(
    (row) => row.overallStats.percentage !== null && row.overallStats.percentage < row.resolvedTarget,
  )

  const overallProjection = useMemo(
    () =>
      computeProjection({
        attended: overall.attended,
        total: overall.total,
        remaining: remainingOverall,
        target: overallMinTarget,
      }),
    [overall, remainingOverall, overallMinTarget],
  )

  const activeSemester = useMemo(() => semesters.find((s) => s.label === semester), [semesters, semester])
  const weekShape = useMemo(
    () => computeWeekShape({ slots, periodTimes: activeSemester?.periodTimes ?? [] }),
    [slots, activeSemester],
  )
  const maxTeachingCount = useMemo(
    () => Math.max(1, ...weekShape.days.map((d) => d.teachingCount)),
    [weekShape],
  )

  const showEspro = esproStatus?.hasCredential === true
  const visibleTileIds = useMemo(
    () =>
      [
        'overall',
        'below-target',
        'today-count',
        showEspro && 'espro',
        'subjects',
        'today-classes',
        'week-shape',
        'upcoming-exams',
        'upcoming-holidays',
      ].filter((id): id is string => Boolean(id)),
    [showEspro],
  )
  const layout = useMemo(() => resolveDashboardLayout(storedLayout, visibleTileIds), [storedLayout, visibleTileIds])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={resetLayout} title="Restore the default tile arrangement">
            <RotateCcw /> Reset layout
          </Button>
          <SemesterSwitcher />
        </div>
      </div>

      <GridLayout
        className="layout"
        layout={layout}
        cols={12}
        rowHeight={40}
        margin={[16, 16]}
        draggableHandle=".drag-handle"
        isResizable
        isDraggable
        onLayoutChange={setLayout}
      >
        <div key="overall">
          <DashboardTile>
            <Card className="h-full">
              <CardHeader>
                <CardDescription>Overall attendance</CardDescription>
                <CardTitle className={cn('text-3xl tabular-nums', percentColor(overall.percentage, overallMinTarget, atRiskMarginPp))}>
                  {overall.percentage === null ? '—' : `${overall.percentage.toFixed(1)}%`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Progress value={overall.percentage ?? 0} />
                <p className="mt-2 text-xs text-muted-foreground">
                  {overall.attended} / {overall.total} periods attended · target {overallMinTarget}%
                </p>
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                  {remainingOverall > 0 && overallProjection.ifAllAttended !== null && (
                    <span
                      title={`If you attend all ${remainingOverall} remaining periods you finish at ${overallProjection.ifAllAttended.toFixed(1)}%; if none, ${overallProjection.ifNoneAttended?.toFixed(1)}%.`}
                    >
                      Projected {overallProjection.ifNoneAttended?.toFixed(0)}–{overallProjection.ifAllAttended.toFixed(0)}%
                      by term end
                    </span>
                  )}
                  {bestStreak >= 3 && (
                    <span className="flex items-center gap-0.5 text-warning">
                      <Flame className="size-3" /> {bestStreak} best streak
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="below-target">
          <DashboardTile>
            <Card className="h-full">
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <AlertTriangle className="size-3.5" /> Below target
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{belowTarget.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {belowTarget.length === 0
                    ? 'No subjects below target.'
                    : belowTarget.map((r) => r.subject.name).join(', ')}
                </p>
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="today-count">
          <DashboardTile>
            <Card className="h-full">
              <CardHeader>
                <CardDescription className="flex items-center gap-1">
                  <CalendarDays className="size-3.5" /> Today
                </CardDescription>
                <CardTitle className="text-3xl tabular-nums">{todaysClasses.length}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {todayHoliday ? `Holiday: ${todayHoliday.label ?? todayHoliday.type}` : 'scheduled periods'}
                </p>
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        {showEspro && (
          <div key="espro">
            <DashboardTile scrollable>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>ESPRO comparison</CardTitle>
                  <CardDescription>
                    Official totals from ESPRO next to BunkMate's own numbers. This only compares: nothing here is
                    imported or changes your records.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!esproStatus?.sessionId ? (
                    <p className="text-sm text-muted-foreground">
                      Add your ESPRO session/term number in{' '}
                      <Link to="/settings" className="underline">
                        Settings
                      </Link>{' '}
                      to enable this.
                    </p>
                  ) : (
                    <>
                      <Button onClick={handleCompareEspro} disabled={esproComparing || !semester}>
                        {esproComparing ? 'Comparing…' : 'Compare with ESPRO'}
                      </Button>
                      {esproError && <p className="text-sm text-destructive">{esproError}</p>}
                      {esproRows && <EsproComparisonTable rows={esproRows} />}
                    </>
                  )}
                </CardContent>
              </Card>
            </DashboardTile>
          </div>
        )}

        <div key="subjects">
          <DashboardTile scrollable>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Subject-wise attendance</CardTitle>
                <CardDescription>Live, computed from attendance records: never stored.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {subjectRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No subjects yet. <Link to="/subjects" className="underline">Add one</Link>.
                  </p>
                )}
                {subjectRows.map(({ subject, overallStats, resolvedTarget, safeBunks, streak, projection, series, recovery }) => (
                  <div key={subject.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="truncate font-medium">{subject.name}</span>
                        {streak >= 3 && (
                          <span
                            className="flex shrink-0 items-center gap-0.5 text-xs text-warning"
                            title={`${streak} in a row attended`}
                          >
                            <Flame className="size-3" />
                            {streak}
                          </span>
                        )}
                      </span>
                      <span className="flex shrink-0 items-center gap-2">
                        <Sparkline values={series} className="hidden sm:block" />
                        <span className={cn('tabular-nums', percentColor(overallStats.percentage, resolvedTarget, atRiskMarginPp))}>
                          {overallStats.percentage === null ? '—' : `${overallStats.percentage.toFixed(1)}%`}
                        </span>
                      </span>
                    </div>
                    <Progress value={overallStats.percentage ?? 0} />
                    <div className="flex flex-wrap items-center justify-between gap-x-3 text-xs text-muted-foreground">
                      <span>
                        {overallStats.attended} / {overallStats.total} periods
                      </span>
                      <span className="flex items-center gap-3">
                        {projection.remaining > 0 && projection.ifAllAttended !== null && (
                          <span
                            title={`If you attend all ${projection.remaining} remaining, you finish at ${projection.ifAllAttended.toFixed(1)}%. If you attend none, ${projection.ifNoneAttended?.toFixed(1)}%.`}
                          >
                            {overallStats.percentage !== null && overallStats.percentage < resolvedTarget
                              ? projection.targetReachable
                                ? `${projection.classesNeededForTarget} of ${projection.remaining} left to hit ${resolvedTarget}%`
                                : `Can't reach ${resolvedTarget}% this term`
                              : `Projected ${projection.ifNoneAttended?.toFixed(0)}–${projection.ifAllAttended.toFixed(0)}%`}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          <ShieldCheck className="size-3" /> {safeBunks} safe bunk{safeBunks === 1 ? '' : 's'}
                        </span>
                      </span>
                    </div>
                    {!recovery.onTrack && (
                      <p className="text-xs text-destructive">
                        {recovery.impossible
                          ? `Recovery: can't reach ${resolvedTarget}% this term even attending every remaining class.`
                          : `Recovery: attend the next ${recovery.needed} session${recovery.needed === 1 ? '' : 's'} (through ${recovery.clearByDate}) with no skips to hit ${resolvedTarget}%.`}
                      </p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="today-classes">
          <DashboardTile scrollable>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Today&apos;s classes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {todayHoliday && (
                  <Badge variant="warning">Holiday: {todayHoliday.label ?? todayHoliday.type}</Badge>
                )}
                {!todayHoliday && todaysClasses.length === 0 && (
                  <p className="text-sm text-muted-foreground">No classes scheduled today.</p>
                )}
                {!todayHoliday &&
                  todaysClasses.map((slot) => (
                    <div key={slot.id} className="flex items-center justify-between text-sm">
                      <span>
                        P{slot.period} · {slot.subjectName ?? slot.type}
                      </span>
                      <Badge variant="outline">{slot.type}</Badge>
                    </div>
                  ))}
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="week-shape">
          <DashboardTile>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Week shape</CardTitle>
                <CardDescription>Teaching periods per day</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {weekShape.days.every((d) => d.teachingCount === 0) ? (
                  <p className="text-sm text-muted-foreground">
                    No timetable yet. <Link to="/timetable" className="underline">Build one</Link>.
                  </p>
                ) : (
                  weekShape.days.map((d) => (
                    <div key={d.day} className="flex items-center gap-2 text-xs">
                      <span
                        className={cn(
                          'w-8 shrink-0 font-medium',
                          weekShape.heaviestDay === d.day && 'text-destructive',
                          weekShape.lightestDay === d.day && 'text-success',
                        )}
                      >
                        {DAY_LABELS[d.day]}
                      </span>
                      <div className="h-3 flex-1 overflow-hidden rounded-sm bg-muted">
                        <div
                          className="h-full rounded-sm bg-primary/70"
                          style={{ width: `${(d.teachingCount / maxTeachingCount) * 100}%` }}
                        />
                      </div>
                      <span className="w-16 shrink-0 text-right tabular-nums text-muted-foreground">
                        {d.teachingCount === 0
                          ? '—'
                          : d.totalMinutes !== null
                            ? `${(d.totalMinutes / 60).toFixed(d.totalMinutes % 60 === 0 ? 0 : 1)}h`
                            : `${d.teachingCount}p`}
                      </span>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="upcoming-exams">
          <DashboardTile scrollable>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Upcoming exams</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingExams.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No upcoming exams. <Link to="/exams" className="underline">Add one</Link>.
                  </p>
                ) : (
                  upcomingExams.map((exam) => (
                    <div key={exam.id} className="flex items-center justify-between gap-2 text-sm">
                      <span className="min-w-0 truncate">
                        {exam.name}
                        {exam.subjectId && subjectsById.get(exam.subjectId) && (
                          <span className="text-muted-foreground"> · {subjectsById.get(exam.subjectId)?.name}</span>
                        )}
                      </span>
                      <Badge variant={countdownLabel(exam.date) === 'Today' ? 'destructive' : 'warning'} className="shrink-0">
                        {countdownLabel(exam.date)}
                      </Badge>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="upcoming-holidays">
          <DashboardTile scrollable>
            <Card className="h-full">
              <CardHeader>
                <CardTitle>Upcoming holidays</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingHolidays.length === 0 && (
                  <p className="text-sm text-muted-foreground">No upcoming holidays on record.</p>
                )}
                {upcomingHolidays.map((h) => (
                  <div key={h.id} className="flex items-center justify-between text-sm">
                    <span>{h.label ?? h.type}</span>
                    <span className="text-muted-foreground">{h.date}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </DashboardTile>
        </div>
      </GridLayout>
    </div>
  )
}
