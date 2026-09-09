import { useEffect, useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, ShieldCheck, Flame, GripVertical, RotateCcw } from 'lucide-react'
import ReactGridLayout, { WidthProvider } from 'react-grid-layout/legacy'
import 'react-grid-layout/css/styles.css'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { Sparkline } from '@/components/ui/sparkline'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { QuickEsproSyncButton } from '@/components/quick-espro-sync'
import { OnboardingChecklist } from '@/components/onboarding-checklist'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useAttendance } from '@/hooks/use-attendance'
import { computeSafeBunkCount, resolveSubjectMinTarget, jsDayToWeekday } from '@/lib/attendance-engine'
import { computeProjection, cumulativeAttendanceSeries, computeRecoveryPlan } from '@/lib/insights'
import { computeAchievements } from '@/lib/achievements'
import { AchievementsStrip } from '@/components/achievements-strip'
import { todayIso } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { useDashboardLayoutStore, resolveDashboardLayout } from '@/store/dashboard-layout-store'

const GridLayout = WidthProvider(ReactGridLayout)

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
  const { layout: storedLayout, setLayout, resetLayout } = useDashboardLayoutStore()

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
  }, [loadSubjects, loadHolidays, loadSemesters])

  useEffect(() => {
    if (semester) loadSlots(semester)
  }, [loadSlots, semester])

  const today = todayIso()
  const todayWeekday = jsDayToWeekday(today)
  const todayHoliday = holidays.find((h) => h.date === today && h.type !== 'working_saturday')
  // Just the count for the compact "Today" tile — the full list with
  // subject names and marking lives on the Today page.
  const todayPeriodCount = useMemo(
    () => (todayWeekday ? slots.filter((s) => s.day === todayWeekday).length : 0),
    [slots, todayWeekday],
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

  const achievements = useMemo(() => {
    const sevenDaysAgo = (() => {
      const d = new Date(`${today}T00:00:00Z`)
      d.setUTCDate(d.getUTCDate() - 6)
      return d.toISOString().slice(0, 10)
    })()
    const last7DaysStatuses = Array.from(recordsBySubject.values())
      .flat()
      .filter((r) => r.date >= sevenDaysAgo && r.date <= today)
      .sort((a, b) => (a.date === b.date ? a.period - b.period : a.date < b.date ? -1 : 1))
      .map((r) => r.status)
    const totalPresentThisSemester = subjectRows.reduce((sum, r) => sum + r.overallStats.attended, 0)
    return computeAchievements({
      last7DaysStatuses,
      overallPercentage: overall.percentage,
      overallMinTarget,
      subjects: subjectRows.map((r) => ({ percentage: r.overallStats.percentage, target: r.resolvedTarget })),
      bestCurrentStreak: bestStreak,
      totalPresentThisSemester,
    })
  }, [recordsBySubject, today, overall, overallMinTarget, subjectRows, bestStreak])

  const visibleTileIds = useMemo(() => ['overall', 'below-target', 'today-count', 'subjects'], [])
  const layout = useMemo(() => resolveDashboardLayout(storedLayout, visibleTileIds), [storedLayout, visibleTileIds])

  // Nothing useful to show yet — a wall of empty/"—" tiles is worse than no
  // dashboard at all for a first-time user. Once a semester, subjects, and a
  // timetable exist, the real dashboard has real numbers to show.
  const semesterSubjects = subjects.filter((s) => s.semester === semester)
  const isOnboarded = semesters.length > 0 && semesterSubjects.length > 0 && slots.some((s) => s.type !== 'lunch')

  if (!isOnboarded) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <SemesterSwitcher />
        </div>
        <div className="mx-auto max-w-md pt-8">
          <p className="mb-4 text-center text-sm text-muted-foreground">
            Your dashboard will show live attendance stats, projections, and more once you've set a few things up.
          </p>
          <OnboardingChecklist />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <div className="flex items-center gap-3">
          <QuickEsproSyncButton variant="default" size="sm" />
          <Button variant="outline" size="sm" onClick={resetLayout} title="Restore the default tile arrangement">
            <RotateCcw /> Reset layout
          </Button>
          <SemesterSwitcher />
        </div>
      </div>

      <AchievementsStrip achievements={achievements} />

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
                <div className="flex items-center justify-between gap-2">
                  <CardDescription>Overall attendance</CardDescription>
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400"
                    title="Calculates approved Yellow Forms & ESPRO duty leave as present/excused"
                  >
                    <ShieldCheck className="size-3" /> Includes Yellow Forms
                  </span>
                </div>
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
                      by term end (worst–best case)
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
                <CardTitle className="text-3xl tabular-nums">{todayPeriodCount}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {todayHoliday ? `Holiday: ${todayHoliday.label ?? todayHoliday.type}` : 'scheduled periods'}
                </p>
              </CardContent>
            </Card>
          </DashboardTile>
        </div>

        <div key="subjects">
          <DashboardTile>
            <Card className="flex h-full flex-col overflow-hidden">
              <CardHeader className="shrink-0 flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle>Subject-wise attendance</CardTitle>
                  <CardDescription className="mt-0.5 text-xs text-muted-foreground">
                    Calculated with approved Yellow Forms & ESPRO duty leave included
                  </CardDescription>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-y-auto space-y-3 pr-4">
                {subjectRows.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    No subjects yet. <Link to="/subjects" className="underline">Add one</Link>.
                  </p>
                )}
                {subjectRows.map(({ subject, overallStats, resolvedTarget, safeBunks, streak, projection, series, recovery }) => (
                  <div key={subject.id} className="rounded-lg border border-border/60 bg-card/40 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
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
                      <span className="flex shrink-0 items-center gap-2.5">
                        <Sparkline values={series} className="hidden sm:block" />
                        <span className={cn('tabular-nums font-semibold', percentColor(overallStats.percentage, resolvedTarget, atRiskMarginPp))}>
                          {overallStats.percentage === null ? '—' : `${overallStats.percentage.toFixed(1)}%`}
                        </span>
                      </span>
                    </div>
                    <Progress value={overallStats.percentage ?? 0} />
                    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground">
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
                              : `Projected ${projection.ifNoneAttended?.toFixed(0)}–${projection.ifAllAttended.toFixed(0)}% (worst–best)`}
                          </span>
                        )}
                        <span className="flex items-center gap-1 font-medium text-foreground/80">
                          <ShieldCheck className="size-3 text-emerald-500" /> {safeBunks} safe bunk{safeBunks === 1 ? '' : 's'}
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

      </GridLayout>
    </div>
  )
}
