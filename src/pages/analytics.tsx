import { useEffect, useMemo, useState } from 'react'
import type { TimetableSlot } from '../../electron/db/repositories/timetable-slots'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  LineChart,
  Line,
  Cell,
} from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useLeavePlansStore } from '@/store/leave-plans-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { usePeriodTypeRulesStore } from '@/store/period-type-rules-store'
import { useAttendance } from '@/hooks/use-attendance'
import { computeAttendance, aggregateOverall } from '@/lib/attendance-engine'
import {
  computeAttendanceTrend,
  computeDailyAttendance,
  computeWeekdayAttendance,
  type TrendGranularity,
} from '@/lib/attendance-trend'
import { resolveSubjectColor, sequentialColor } from '@/lib/chart-colors'
import { buildSubjectRows, exportReport, type ReportFormat } from '@/lib/report-export'
import { scopeRecordsToSubjects } from '@/lib/semester-scope'
import { useToastStore } from '@/store/toast-store'
import { todayIso } from '@/lib/date-utils'
import { cn } from '@/lib/utils'

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function mondayOnOrBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  const day = d.getUTCDay()
  const diff = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diff)
  return d.toISOString().slice(0, 10)
}

const HEATMAP_WEEKS = 12
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAY_SHORT_LABELS: Record<string, string> = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat' }

export function AnalyticsPage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const subjectMinTarget = useSettingsStore((s) => s.subjectMinTarget)
  const semester = currentSemester || null

  const { semesters: allSemesters, load: loadSemesters } = useSemestersStore()
  const records = useAttendanceStore((s) => s.records)
  const slots = useTimetableStore((s) => s.slots)
  const holidays = useHolidaysStore((s) => s.holidays)
  const yellowForms = useYellowFormsStore((s) => s.forms)
  const rules = usePeriodTypeRulesStore((s) => s.rules)
  const { plans, load: loadPlans } = useLeavePlansStore()
  const { bySubject, overall } = useAttendance(semester)
  const pushToast = useToastStore((s) => s.push)

  const [granularity, setGranularity] = useState<TrendGranularity>('week')
  const [exporting, setExporting] = useState(false)
  const [slotsBySemester, setSlotsBySemester] = useState<Record<string, TimetableSlot[]>>({})

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadPlans()
    loadSemesters()
  }, [loadSubjects, loadPlans, loadSemesters])

  const comparableSemesters = useMemo(
    () => allSemesters.filter((s) => !s.archived).sort((a, b) => a.number - b.number),
    [allSemesters],
  )

  // `records` above is the raw, unscoped attendance-records store — it has
  // no semester concept at all (see semester-scope.ts). Subjects carry the
  // `semester` text field that's the only way to attribute a record to a
  // semester, so every use below scopes records through this map rather
  // than feeding the raw store straight into computeAttendance().
  const subjectIdsBySemesterLabel = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const s of subjects) {
      const list = map.get(s.semester)
      if (list) list.push(s.id)
      else map.set(s.semester, [s.id])
    }
    return map
  }, [subjects])

  const currentSemesterSubjects = useMemo(
    () => subjects.filter((s) => s.semester === semester),
    [subjects, semester],
  )
  const currentSemesterSubjectIds = useMemo(
    () => subjectIdsBySemesterLabel.get(semester ?? '') ?? [],
    [subjectIdsBySemesterLabel, semester],
  )
  const scopedRecords = useMemo(
    () => scopeRecordsToSubjects(records, currentSemesterSubjectIds),
    [records, currentSemesterSubjectIds],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all(
      comparableSemesters.map(async (s) => [s.label, await window.bunkmate.timetableSlots.list({ semester: s.label })] as const),
    ).then((entries) => {
      if (!cancelled) setSlotsBySemester(Object.fromEntries(entries))
    })
    return () => {
      cancelled = true
    }
  }, [comparableSemesters])

  const semesterComparison = useMemo(
    () =>
      comparableSemesters.map((s) => {
        const semesterSlots = slotsBySemester[s.label] ?? []
        const semesterRecords = scopeRecordsToSubjects(records, subjectIdsBySemesterLabel.get(s.label) ?? [])
        const stats = aggregateOverall(computeAttendance({ records: semesterRecords, slots: semesterSlots, holidays, yellowForms, rules }))
        return { label: s.label, percentage: stats.percentage ?? 0, isCurrent: s.label === currentSemester }
      }),
    [comparableSemesters, slotsBySemester, records, subjectIdsBySemesterLabel, holidays, yellowForms, rules, currentSemester],
  )

  const subjectRows = useMemo(
    () => buildSubjectRows(currentSemesterSubjects, bySubject, subjectMinTarget),
    [currentSemesterSubjects, bySubject, subjectMinTarget],
  )

  const barData = useMemo(
    () =>
      subjectRows.map((row, i) => ({
        name: row.name,
        percentage: row.percentage ?? 0,
        // subjectRows is built from currentSemesterSubjects in the same order,
        // so index i lines up with the subject whose chosen color to prefer.
        fill: resolveSubjectColor(currentSemesterSubjects[i]?.color, i),
      })),
    [subjectRows, currentSemesterSubjects],
  )

  const trend = useMemo(
    () => computeAttendanceTrend({ records: scopedRecords, slots, holidays, yellowForms, rules, granularity }),
    [scopedRecords, slots, holidays, yellowForms, rules, granularity],
  )

  const dailyStats = useMemo(
    () => computeDailyAttendance({ records: scopedRecords, slots, holidays, yellowForms, rules }),
    [scopedRecords, slots, holidays, yellowForms, rules],
  )

  const weekdayData = useMemo(
    () =>
      computeWeekdayAttendance({ records: scopedRecords, slots, holidays, yellowForms, rules }).map((r) => ({
        day: WEEKDAY_SHORT_LABELS[r.day],
        percentage: r.stats.percentage ?? 0,
        hasData: r.stats.total > 0,
        total: r.stats.total,
      })),
    [scopedRecords, slots, holidays, yellowForms, rules],
  )

  const worstWeekday = useMemo(() => {
    const withData = weekdayData.filter((d) => d.hasData)
    if (withData.length === 0) return null
    return withData.reduce((worst, d) => (d.percentage < worst.percentage ? d : worst))
  }, [weekdayData])

  const heatmapWeeks = useMemo(() => {
    const endWeekMonday = mondayOnOrBefore(todayIso())
    const startWeekMonday = addDaysIso(endWeekMonday, -7 * (HEATMAP_WEEKS - 1))
    const weeks: string[][] = []
    let weekStart = startWeekMonday
    for (let w = 0; w < HEATMAP_WEEKS; w++) {
      const days: string[] = []
      for (let d = 0; d < 7; d++) days.push(addDaysIso(weekStart, d))
      weeks.push(days)
      weekStart = addDaysIso(weekStart, 7)
    }
    return weeks
  }, [])

  async function handleExport(format: ReportFormat) {
    setExporting(true)
    try {
      const path = await exportReport(
        {
          generatedAt: new Date().toISOString(),
          semester: currentSemester || '—',
          overallMinTarget,
          overall,
          subjects: subjectRows,
          attendanceHistory: [...scopedRecords]
            .sort((a, b) => (a.date < b.date ? 1 : -1))
            .map((r) => ({
              date: r.date,
              subject: subjects.find((s) => s.id === r.subjectId)?.name ?? `#${r.subjectId}`,
              period: r.period,
              status: r.status,
              source: r.source,
            })),
          leaveHistory: plans.map((p) => ({
            label: p.label ?? `Plan #${p.id}`,
            dates: `${p.dates[0]} – ${p.dates[p.dates.length - 1]} (${p.dates.length} days)`,
            status: p.status,
          })),
        },
        format,
      )
      if (path) pushToast({ title: 'Report exported', description: path })
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Analytics</h1>
        <div className="flex items-center gap-4">
          <SemesterSwitcher />
          <div className="flex gap-2">
            <Button variant="outline" disabled={exporting} onClick={() => handleExport('csv')}>
              <Download /> CSV
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => handleExport('excel')}>
              <Download /> Excel
            </Button>
            <Button variant="outline" disabled={exporting} onClick={() => handleExport('pdf')}>
              <Download /> PDF
            </Button>
          </div>
        </div>
      </div>

      {semesterComparison.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Semester comparison</CardTitle>
            <CardDescription>Overall attendance % per semester, current semester highlighted.</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={semesterComparison} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <ReferenceLine y={overallMinTarget} stroke="var(--warning)" strokeDasharray="4 4" />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Overall']}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                  {semesterComparison.map((entry, i) => (
                    <Cell key={i} fill={entry.isCurrent ? 'var(--chart-1)' : 'var(--chart-grid)'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Subject-wise attendance</CardTitle>
          <CardDescription>
            Current overall percentage per subject, against the {subjectMinTarget}% default subject target
            (subjects with their own override may use a different one).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={barData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="name" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
              <ReferenceLine y={subjectMinTarget} stroke="var(--warning)" strokeDasharray="4 4" />
              <Tooltip
                formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Attendance']}
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                {barData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance by weekday</CardTitle>
          <CardDescription>
            {worstWeekday
              ? `You're most likely to be marked absent on ${worstWeekday.day} (${worstWeekday.percentage.toFixed(1)}%).`
              : 'Which day of the week you actually attend the least (not enough history yet).'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={weekdayData} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
              <XAxis dataKey="day" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
              <ReferenceLine y={overallMinTarget} stroke="var(--warning)" strokeDasharray="4 4" />
              <Tooltip
                formatter={(value, _name, item) => [
                  item.payload.hasData ? `${Number(value).toFixed(1)}%` : 'No data',
                  'Attendance',
                ]}
                contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
              />
              <Bar dataKey="percentage" radius={[4, 4, 0, 0]}>
                {weekdayData.map((entry, i) => (
                  <Cell
                    key={i}
                    fill={!entry.hasData ? 'var(--chart-grid)' : entry.day === worstWeekday?.day ? 'var(--destructive)' : 'var(--chart-1)'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Attendance trend</CardTitle>
              <CardDescription>Cumulative overall percentage over time.</CardDescription>
            </div>
            <Select value={granularity} onValueChange={(v) => setGranularity(v as TrendGranularity)}>
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="week">Weekly</SelectItem>
                <SelectItem value="month">Monthly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {trend.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attendance history yet.</p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                <XAxis dataKey="bucket" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                <ReferenceLine y={overallMinTarget} stroke="var(--warning)" strokeDasharray="4 4" />
                <Tooltip
                  formatter={(value) => [`${Number(value).toFixed(1)}%`, 'Overall']}
                  contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Line
                  type="monotone"
                  dataKey="percentage"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Attendance heatmap</CardTitle>
          <CardDescription>Last {HEATMAP_WEEKS} weeks, one square per day.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-1 overflow-x-auto pb-2">
            <div className="flex flex-col gap-1 pt-5 pr-1 text-[10px] text-muted-foreground">
              {WEEKDAY_LABELS.map((label) => (
                <div key={label} className="h-3.5 leading-3.5">
                  {label}
                </div>
              ))}
            </div>
            {heatmapWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-1">
                {wi === 0 && <div className="h-4" />}
                {week.map((day) => {
                  const stats = dailyStats.get(day)
                  return (
                    <div
                      key={day}
                      title={`${day}: ${stats ? `${stats.attended}/${stats.total} (${stats.percentage?.toFixed(0)}%)` : 'no data'}`}
                      className={cn('size-3.5 rounded-sm', day === todayIso() && 'ring-1 ring-primary')}
                      style={{ backgroundColor: sequentialColor(stats?.percentage ?? null) }}
                    />
                  )
                })}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
