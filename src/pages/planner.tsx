import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { usePeriodTypeRulesStore } from '@/store/period-type-rules-store'
import { useLeavePlansStore } from '@/store/leave-plans-store'
import { ExamEligibilitySimulator } from '@/components/exam-eligibility-simulator'
import { useAttendance } from '@/hooks/use-attendance'
import { scopeRecordsToSubjects } from '@/lib/semester-scope'
import { todayIso } from '@/lib/date-utils'
import {
  computeAttendance,
  aggregateOverall,
  enumerateScheduledPeriods,
  scheduledPeriodsForDates,
  projectRecords,
  computeSafeBunkCount,
  computeClassesNeededToReachTarget,
  type SubjectAttendance,
  type BucketStats,
} from '@/lib/attendance-engine'
import { cn } from '@/lib/utils'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function dateRange(start: string, end: string): string[] {
  const dates: string[] = []
  let cursor = start
  while (cursor <= end) {
    dates.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return dates
}

function fmtPct(stats: BucketStats): string {
  return stats.percentage === null ? '—' : `${stats.percentage.toFixed(1)}%`
}

interface ComparisonRow {
  subjectId: number
  name: string
  before: BucketStats
  after: BucketStats
}

function ComparisonTable({ rows, overallBefore, overallAfter }: {
  rows: ComparisonRow[]
  overallBefore: BucketStats
  overallAfter: BucketStats
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Subject</TableHead>
          <TableHead>Before</TableHead>
          <TableHead>After</TableHead>
          <TableHead>Change</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const delta = (row.after.percentage ?? 0) - (row.before.percentage ?? 0)
          return (
            <TableRow key={row.subjectId}>
              <TableCell className="font-medium">{row.name}</TableCell>
              <TableCell>{fmtPct(row.before)}</TableCell>
              <TableCell>{fmtPct(row.after)}</TableCell>
              <TableCell className={cn(delta > 0 && 'text-success', delta < 0 && 'text-destructive')}>
                {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta.toFixed(1)}pp`}
              </TableCell>
            </TableRow>
          )
        })}
        <TableRow>
          <TableCell className="font-semibold">Overall</TableCell>
          <TableCell className="font-semibold">{fmtPct(overallBefore)}</TableCell>
          <TableCell className="font-semibold">{fmtPct(overallAfter)}</TableCell>
          <TableCell className="font-semibold">
            {((overallAfter.percentage ?? 0) - (overallBefore.percentage ?? 0)).toFixed(1)}pp
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}

function buildComparisonRows(
  subjects: { id: number; name: string }[],
  before: Map<number, SubjectAttendance>,
  after: Map<number, SubjectAttendance>,
): ComparisonRow[] {
  const empty: BucketStats = { total: 0, attended: 0, percentage: null }
  return subjects
    .map((s) => ({
      subjectId: s.id,
      name: s.name,
      before: before.get(s.id)?.overall ?? empty,
      after: after.get(s.id)?.overall ?? empty,
    }))
    .filter((row) => row.before.total > 0 || row.after.total > 0)
}

function SafeBunkCalculatorTab({
  subjects,
  baselineMap,
}: {
  subjects: { id: number; name: string }[]
  baselineMap: Map<number, SubjectAttendance>
}) {
  const [targetPercent, setTargetPercent] = useState<number>(75)
  const [simSubjectId, setSimSubjectId] = useState<string>(subjects[0] ? String(subjects[0].id) : '')
  const [simBunks, setSimBunks] = useState<string>('1')

  const subjectStats = useMemo(() => {
    return subjects.map((s) => {
      const att = baselineMap.get(s.id)?.overall ?? { total: 0, attended: 0, percentage: null }
      const safeBunks = computeSafeBunkCount(att.attended, att.total, targetPercent)
      const classesNeeded = computeClassesNeededToReachTarget(att.attended, att.total, targetPercent)
      return {
        subject: s,
        att,
        safeBunks,
        classesNeeded,
      }
    })
  }, [subjects, baselineMap, targetPercent])

  const selectedSimSubject = subjects.find((s) => String(s.id) === simSubjectId)
  const simBaselineAtt = selectedSimSubject
    ? baselineMap.get(selectedSimSubject.id)?.overall ?? { total: 0, attended: 0, percentage: null }
    : { total: 0, attended: 0, percentage: null }

  const simResult = useMemo(() => {
    const numBunks = Math.max(0, Number(simBunks) || 0)
    const newTotal = simBaselineAtt.total + numBunks
    const newAttended = simBaselineAtt.attended
    const newPercentage = newTotal > 0 ? (newAttended / newTotal) * 100 : null
    const diff = (newPercentage ?? 0) - (simBaselineAtt.percentage ?? 0)
    const dropsBelowTarget = (simBaselineAtt.percentage ?? 100) >= targetPercent && (newPercentage ?? 0) < targetPercent
    return {
      newTotal,
      newAttended,
      newPercentage,
      diff,
      dropsBelowTarget,
    }
  }, [simBaselineAtt, simBunks, targetPercent])

  return (
    <div className="space-y-6 pt-4">
      {/* Target Percentage Control */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-xl border p-4 bg-muted/30">
        <div>
          <h3 className="font-semibold text-sm">Target Threshold</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Adjust target threshold to calculate safe bunks and attendance recovery count.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[75, 80, 85].map((pct) => (
            <Button
              key={pct}
              type="button"
              variant={targetPercent === pct ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTargetPercent(pct)}
              className="text-xs h-8"
            >
              {pct}% Target
            </Button>
          ))}
          <Input
            type="number"
            min={50}
            max={100}
            value={targetPercent}
            onChange={(e) => setTargetPercent(Math.min(100, Math.max(1, Number(e.target.value) || 75)))}
            className="w-20 h-8 text-xs font-semibold"
          />
        </div>
      </div>

      {/* Instant Bunk Simulator Widget */}
      <Card className="p-4 border bg-card/60 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">Instant Bunk Impact Predictor</h3>
          <Badge variant="outline" className="text-[11px] font-normal">What-If Predictor</Badge>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="sim-subject" className="text-xs text-muted-foreground">Select Subject</Label>
            <Select value={simSubjectId} onValueChange={setSimSubjectId}>
              <SelectTrigger id="sim-subject" className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {subjects.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sim-bunks" className="text-xs text-muted-foreground">Simulate Missed Classes (Bunks)</Label>
            <Input
              id="sim-bunks"
              type="number"
              min={1}
              max={50}
              value={simBunks}
              onChange={(e) => setSimBunks(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="rounded-lg border p-2.5 bg-muted/20 flex flex-col justify-center">
            <span className="text-[11px] text-muted-foreground font-medium">Projected Attendance</span>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-base font-bold tabular-nums">
                {simResult.newPercentage !== null ? `${simResult.newPercentage.toFixed(1)}%` : '—'}
              </span>
              <span className={cn('text-xs font-medium', simResult.diff < 0 ? 'text-rose-500' : 'text-emerald-500')}>
                ({simResult.diff.toFixed(1)}pp)
              </span>
            </div>
            {simResult.dropsBelowTarget && (
              <span className="text-[10px] text-rose-500 font-semibold mt-0.5">
                ⚠️ Drops below {targetPercent}% target!
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Per-Subject Safe Bunks & Recovery Cards */}
      <div>
        <h3 className="font-semibold text-sm mb-3">Subject Allowance & Recovery Status</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {subjectStats.map(({ subject, att, safeBunks, classesNeeded }) => {
            const isAbove = (att.percentage ?? 100) >= targetPercent
            const isAtRisk = (att.percentage ?? 100) >= targetPercent && safeBunks <= 1

            return (
              <Card key={subject.id} className="p-3.5 bg-card/60 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold text-xs truncate max-w-[170px]" title={subject.name}>{subject.name}</h4>
                  <Badge
                    variant={isAbove ? (isAtRisk ? 'warning' : 'success') : 'destructive'}
                    className="font-semibold text-xs px-2 py-0.5"
                  >
                    {att.percentage !== null ? `${att.percentage.toFixed(1)}%` : 'No Classes'}
                  </Badge>
                </div>

                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>Attended: {att.attended}/{att.total}</span>
                  <span>Target: {targetPercent}%</span>
                </div>

                <div className="pt-2 border-t text-xs">
                  {isAbove ? (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px]">Safe to bunk:</span>
                      <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 font-semibold text-xs">
                        {safeBunks === Infinity ? 'Unlimited' : `${safeBunks} class${safeBunks === 1 ? '' : 'es'}`}
                      </Badge>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px]">Must attend next:</span>
                      <Badge variant="destructive" className="font-semibold text-xs">
                        {classesNeeded} class{classesNeeded === 1 ? '' : 'es'}
                      </Badge>
                    </div>
                  )}
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function PlannerPage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const semester = currentSemester || null

  const records = useAttendanceStore((s) => s.records)
  const slots = useTimetableStore((s) => s.slots)
  const holidays = useHolidaysStore((s) => s.holidays)
  const yellowForms = useYellowFormsStore((s) => s.forms)
  const rules = usePeriodTypeRulesStore((s) => s.rules)
  const { bySubject: baseline, overall: baselineOverall } = useAttendance(semester)

  // `records` above is the raw, unscoped attendance-records store (no
  // semester concept — see semester-scope.ts) — every scenario below layers
  // hypothetical records on top of it, so it has to be scoped to this
  // semester's subjects first or a different semester's history leaks into
  // every "after" projection.
  const currentSemesterSubjectIds = useMemo(
    () => subjects.filter((s) => s.semester === semester).map((s) => s.id),
    [subjects, semester],
  )
  const scopedRecords = useMemo(
    () => scopeRecordsToSubjects(records, currentSemesterSubjectIds),
    [records, currentSemesterSubjectIds],
  )

  const { plans, load: loadPlans, create: createPlan, update: updatePlan, remove: removePlan } =
    useLeavePlansStore()

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadPlans()
  }, [loadSubjects, loadPlans])

  const tomorrow = useMemo(() => addDays(todayIso(), 1), [])

  // --- Scenario 1: Bunk tomorrow -----------------------------------------
  const [bunkSubjectId, setBunkSubjectId] = useState<string>('all')
  const bunkComparison = useMemo(() => {
    const periods = enumerateScheduledPeriods({ slots, holidays, startDate: tomorrow, endDate: tomorrow })
      .filter((p) => bunkSubjectId === 'all' || String(p.subjectId) === bunkSubjectId)
    const hypothetical = projectRecords(periods, 'absent')
    const after = computeAttendance({ records: [...scopedRecords, ...hypothetical], slots, holidays, yellowForms, rules })
    return {
      rows: buildComparisonRows(subjects, baseline, after),
      overallAfter: aggregateOverall(after),
      periodCount: periods.length,
    }
  }, [slots, holidays, tomorrow, bunkSubjectId, scopedRecords, yellowForms, rules, subjects, baseline])

  // --- Scenario 2: Attend everything remaining ---------------------------
  const [attendEndDate, setAttendEndDate] = useState(() => addDays(todayIso(), 30))
  const attendComparison = useMemo(() => {
    const periods = enumerateScheduledPeriods({ slots, holidays, startDate: tomorrow, endDate: attendEndDate })
    const hypothetical = projectRecords(periods, 'present')
    const after = computeAttendance({ records: [...scopedRecords, ...hypothetical], slots, holidays, yellowForms, rules })
    return {
      rows: buildComparisonRows(subjects, baseline, after),
      overallAfter: aggregateOverall(after),
      periodCount: periods.length,
    }
  }, [slots, holidays, tomorrow, attendEndDate, scopedRecords, yellowForms, rules, subjects, baseline])

  // --- Scenario 3: Leave for N days ---------------------------------------
  const [leaveStart, setLeaveStart] = useState(tomorrow)
  const [leaveDays, setLeaveDays] = useState('1')
  const [leaveLabel, setLeaveLabel] = useState('')
  const leaveDates = useMemo(
    () => dateRange(leaveStart, addDays(leaveStart, Math.max(0, Number(leaveDays) - 1))),
    [leaveStart, leaveDays],
  )
  const leaveComparison = useMemo(() => {
    const periods = scheduledPeriodsForDates({ slots, holidays, dates: leaveDates })
    const hypothetical = projectRecords(periods, 'absent')
    const after = computeAttendance({ records: [...scopedRecords, ...hypothetical], slots, holidays, yellowForms, rules })
    return {
      rows: buildComparisonRows(subjects, baseline, after),
      overallAfter: aggregateOverall(after),
      periodCount: periods.length,
    }
  }, [slots, holidays, leaveDates, scopedRecords, yellowForms, rules, subjects, baseline])

  async function handleSaveLeavePlan() {
    await createPlan({ label: leaveLabel || null, dates: leaveDates, status: 'planned' })
    setLeaveLabel('')
  }

  // --- Scenario 4: Yellow form approval -----------------------------------
  const pendingForms = useMemo(() => yellowForms.filter((f) => f.status === 'pending'), [yellowForms])
  const [formId, setFormId] = useState<string>('')
  const formComparison = useMemo(() => {
    if (!formId) return null
    const withApproval = yellowForms.map((f) =>
      f.id === Number(formId) ? { ...f, status: 'approved' as const } : f,
    )
    const after = computeAttendance({ records: scopedRecords, slots, holidays, yellowForms: withApproval, rules })
    return { rows: buildComparisonRows(subjects, baseline, after), overallAfter: aggregateOverall(after) }
  }, [formId, yellowForms, scopedRecords, slots, holidays, rules, subjects, baseline])

  // --- Compare saved leave plans side by side -----------------------------
  const [comparePlanIds, setComparePlanIds] = useState<number[]>([])
  const planComparisons = useMemo(() => {
    return comparePlanIds.map((id) => {
      const plan = plans.find((p) => p.id === id)
      if (!plan) return null
      const periods = scheduledPeriodsForDates({ slots, holidays, dates: plan.dates })
      const hypothetical = projectRecords(periods, 'absent')
      const after = computeAttendance({ records: [...scopedRecords, ...hypothetical], slots, holidays, yellowForms, rules })
      return { plan, overall: aggregateOverall(after) }
    }).filter((x): x is NonNullable<typeof x> => x !== null)
  }, [comparePlanIds, plans, slots, holidays, scopedRecords, yellowForms, rules])

  function togglePlanCompare(id: number) {
    setComparePlanIds((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]))
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Simulator &amp; Leave Planner</h1>
      <p className="text-sm text-muted-foreground">
        Try out "what if" scenarios below — nothing is saved or changes your real attendance unless you explicitly
        save a leave plan.
      </p>

      <Card>
        <CardHeader>
          <CardTitle>Simulator</CardTitle>
          <CardDescription>Just a preview — pick a scenario below to see what it would do to your attendance.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="safebunk">
            <TabsList>
              <TabsTrigger value="eligibility">🎓 Exam Eligibility</TabsTrigger>
              <TabsTrigger value="safebunk">🎯 Safe Bunk &amp; Calculator</TabsTrigger>
              <TabsTrigger value="bunk">Bunk tomorrow</TabsTrigger>
              <TabsTrigger value="attend">Attend everything</TabsTrigger>
              <TabsTrigger value="leave">Leave for N days</TabsTrigger>
              <TabsTrigger value="form">Yellow form</TabsTrigger>
            </TabsList>

            <TabsContent value="eligibility">
              <ExamEligibilitySimulator />
            </TabsContent>

            <TabsContent value="safebunk">
              <SafeBunkCalculatorTab subjects={subjects} baselineMap={baseline} />
            </TabsContent>

            <TabsContent value="bunk" className="space-y-4 pt-4">
              <div className="flex items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="bunk-subject">Subject</Label>
                  <Select value={bunkSubjectId} onValueChange={setBunkSubjectId}>
                    <SelectTrigger id="bunk-subject" className="w-56">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All of tomorrow&apos;s classes</SelectItem>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground">
                  Tomorrow ({tomorrow}) has {bunkComparison.periodCount} matching period
                  {bunkComparison.periodCount === 1 ? '' : 's'}.
                </p>
              </div>
              <ComparisonTable
                rows={bunkComparison.rows}
                overallBefore={baselineOverall}
                overallAfter={bunkComparison.overallAfter}
              />
            </TabsContent>

            <TabsContent value="attend" className="space-y-4 pt-4">
              <div className="flex items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="attend-end">Attend everything through</Label>
                  <Input
                    id="attend-end"
                    type="date"
                    className="w-44"
                    value={attendEndDate}
                    onChange={(e) => setAttendEndDate(e.target.value)}
                  />
                </div>
                <p className="text-sm text-muted-foreground">{attendComparison.periodCount} periods projected.</p>
              </div>
              <ComparisonTable
                rows={attendComparison.rows}
                overallBefore={baselineOverall}
                overallAfter={attendComparison.overallAfter}
              />
            </TabsContent>

            <TabsContent value="leave" className="space-y-4 pt-4">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="leave-start">Starting</Label>
                  <Input
                    id="leave-start"
                    type="date"
                    className="w-44"
                    value={leaveStart}
                    onChange={(e) => setLeaveStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-days">Days</Label>
                  <Input
                    id="leave-days"
                    type="number"
                    min={1}
                    className="w-24"
                    value={leaveDays}
                    onChange={(e) => setLeaveDays(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="leave-label">Label (optional)</Label>
                  <Input
                    id="leave-label"
                    className="w-56"
                    value={leaveLabel}
                    onChange={(e) => setLeaveLabel(e.target.value)}
                    placeholder="Family trip"
                  />
                </div>
                <Button type="button" onClick={handleSaveLeavePlan}>
                  Save as leave plan
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                {leaveDates[0]} to {leaveDates[leaveDates.length - 1]} · {leaveComparison.periodCount} periods
                missed.
              </p>
              <ComparisonTable
                rows={leaveComparison.rows}
                overallBefore={baselineOverall}
                overallAfter={leaveComparison.overallAfter}
              />
            </TabsContent>

            <TabsContent value="form" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label htmlFor="form-select">Pending yellow form</Label>
                <Select value={formId} onValueChange={setFormId}>
                  <SelectTrigger id="form-select" className="w-72">
                    <SelectValue placeholder="Choose a pending form" />
                  </SelectTrigger>
                  <SelectContent>
                    {pendingForms.map((f) => (
                      <SelectItem key={f.id} value={String(f.id)}>
                        {subjects.find((s) => s.id === f.subjectId)?.name ?? `#${f.subjectId}`} · {f.date}
                        {f.period ? ` · P${f.period}` : ' · whole day'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {pendingForms.length === 0 && (
                <p className="text-sm text-muted-foreground">No pending yellow forms to simulate.</p>
              )}
              {formComparison && (
                <ComparisonTable
                  rows={formComparison.rows}
                  overallBefore={baselineOverall}
                  overallAfter={formComparison.overallAfter}
                />
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Saved leave plans</CardTitle>
          <CardDescription>Select 2 or more to compare their projected impact side by side.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">Compare</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                    No saved leave plans yet.
                  </TableCell>
                </TableRow>
              )}
              {plans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell>
                    <Checkbox
                      checked={comparePlanIds.includes(plan.id)}
                      onCheckedChange={() => togglePlanCompare(plan.id)}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{plan.label ?? '(untitled)'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {plan.dates[0]}
                    {plan.dates.length > 1 ? ` – ${plan.dates[plan.dates.length - 1]}` : ''} ({plan.dates.length}{' '}
                    day{plan.dates.length === 1 ? '' : 's'})
                  </TableCell>
                  <TableCell>
                    <Select
                      value={plan.status}
                      onValueChange={(v) => updatePlan(plan.id, { status: v as typeof plan.status })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="planned">Planned</SelectItem>
                        <SelectItem value="taken">Taken</SelectItem>
                        <SelectItem value="cancelled">Cancelled</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => removePlan(plan.id)}>
                      Delete
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {planComparisons.length >= 2 && (
            <div className="space-y-2 border-t pt-4">
              <h3 className="text-sm font-semibold">Scenario comparison</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Plan</TableHead>
                    <TableHead>Projected overall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Current (no leave)</TableCell>
                    <TableCell>{fmtPct(baselineOverall)}</TableCell>
                  </TableRow>
                  {planComparisons.map(({ plan, overall }) => (
                    <TableRow key={plan.id}>
                      <TableCell className="font-medium">{plan.label ?? `Plan #${plan.id}`}</TableCell>
                      <TableCell>{fmtPct(overall)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
