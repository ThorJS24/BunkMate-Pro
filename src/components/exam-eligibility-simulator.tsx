import { useMemo, useState } from 'react'
import { GraduationCap, AlertTriangle, CheckCircle2, XCircle, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Card } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { usePeriodTypeRulesStore } from '@/store/period-type-rules-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useAttendance } from '@/hooks/use-attendance'
import { scopeRecordsToSubjects } from '@/lib/semester-scope'
import { todayIso } from '@/lib/date-utils'
import {
  computeAttendance,
  enumerateScheduledPeriods,
  projectRecords,
  computeSafeBunkCount,
  type BucketStats,
} from '@/lib/attendance-engine'
type Subject = ReturnType<typeof useSubjectsStore.getState>['subjects'][number]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

interface EligibilityMatrixItem {
  subject: Subject
  baselineStats: BucketStats
  projectedStats: BucketStats
  futureTotal: number
  status: 'eligible' | 'condonation' | 'withheld'
  safeBunksToEnd: number
}

export function ExamEligibilitySimulator() {
  const { subjects } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const semester = currentSemester || null
  const semesters = useSemestersStore((s) => s.semesters)

  const activeSemesterObj = semesters.find((s) => s.label === semester)
  const defaultEndDate = activeSemesterObj?.endDate || addDays(todayIso(), 60)

  const [endDate, setEndDate] = useState<string>(defaultEndDate)
  const [futureAttendanceRate, setFutureAttendanceRate] = useState<number>(100)
  const [includePendingYellowForms, setIncludePendingYellowForms] = useState<boolean>(true)

  const records = useAttendanceStore((s) => s.records)
  const slots = useTimetableStore((s) => s.slots)
  const holidays = useHolidaysStore((s) => s.holidays)
  const yellowForms = useYellowFormsStore((s) => s.forms)
  const rules = usePeriodTypeRulesStore((s) => s.rules)
  const { bySubject: baselineMap } = useAttendance(semester)

  const currentSemesterSubjectIds = useMemo(
    () => subjects.filter((s: Subject) => s.semester === semester).map((s: Subject) => s.id),
    [subjects, semester],
  )
  const scopedRecords = useMemo(
    () => scopeRecordsToSubjects(records, currentSemesterSubjectIds),
    [records, currentSemesterSubjectIds],
  )

  const tomorrow = useMemo(() => addDays(todayIso(), 1), [])

  const effectiveYellowForms = useMemo(() => {
    if (!includePendingYellowForms) return yellowForms
    return yellowForms.map((f) => (f.status === 'pending' ? { ...f, status: 'approved' as const } : f))
  }, [yellowForms, includePendingYellowForms])

  const eligibilityMatrix: EligibilityMatrixItem[] = useMemo(() => {
    const targetEndDate = endDate || defaultEndDate
    if (targetEndDate < tomorrow) {
      return []
    }

    const remainingPeriods = enumerateScheduledPeriods({
      slots,
      holidays,
      startDate: tomorrow,
      endDate: targetEndDate,
    })

    const activeSubjects = subjects.filter((s: Subject) => s.semester === semester)

    return activeSubjects.map((subject: Subject) => {
      const subjectPeriods = remainingPeriods.filter((p) => p.subjectId === subject.id)
      const futureTotal = subjectPeriods.length

      const futureAttended = Math.round(futureTotal * (futureAttendanceRate / 100))
      const futureAttendedPeriods = subjectPeriods.slice(0, futureAttended)
      const futureAbsentPeriods = subjectPeriods.slice(futureAttended)

      const hypotheticalAttendedRecords = projectRecords(futureAttendedPeriods, 'present')
      const hypotheticalAbsentRecords = projectRecords(futureAbsentPeriods, 'absent')

      const hypotheticalRecords = [...scopedRecords, ...hypotheticalAttendedRecords, ...hypotheticalAbsentRecords]

      const afterAttendance = computeAttendance({
        records: hypotheticalRecords,
        slots,
        holidays,
        yellowForms: effectiveYellowForms,
        rules,
      })

      const baselineStats: BucketStats = baselineMap.get(subject.id)?.overall ?? { total: 0, attended: 0, percentage: null }
      const projectedStats: BucketStats = afterAttendance.get(subject.id)?.overall ?? baselineStats

      const projectedPct = projectedStats.percentage ?? 0
      const status: 'eligible' | 'condonation' | 'withheld' =
        projectedPct >= 85 ? 'eligible' : projectedPct >= 75 ? 'condonation' : 'withheld'

      const safeBunksToEnd = computeSafeBunkCount(projectedStats.attended, projectedStats.total, 85)

      return {
        subject,
        baselineStats,
        projectedStats,
        futureTotal,
        status,
        safeBunksToEnd,
      }
    })
  }, [
    subjects,
    semester,
    endDate,
    defaultEndDate,
    tomorrow,
    slots,
    holidays,
    futureAttendanceRate,
    scopedRecords,
    effectiveYellowForms,
    rules,
    baselineMap,
  ])

  const summary = useMemo(() => {
    const total = eligibilityMatrix.length
    const eligible = eligibilityMatrix.filter((m: EligibilityMatrixItem) => m.status === 'eligible').length
    const condonation = eligibilityMatrix.filter((m: EligibilityMatrixItem) => m.status === 'condonation').length
    const withheld = eligibilityMatrix.filter((m: EligibilityMatrixItem) => m.status === 'withheld').length
    return { total, eligible, condonation, withheld }
  }, [eligibilityMatrix])

  return (
    <div className="space-y-6 pt-2">
      {/* Top Banner Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Card className="p-4 border bg-card/60">
          <span className="text-xs text-muted-foreground font-medium">Active Subjects</span>
          <p className="text-2xl font-bold mt-1 tabular-nums">{summary.total}</p>
        </Card>
        <Card className="p-4 border border-emerald-500/30 bg-emerald-500/10">
          <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium flex items-center gap-1">
            <CheckCircle2 className="size-3.5" /> Eligible (≥85%)
          </span>
          <p className="text-2xl font-bold mt-1 text-emerald-600 dark:text-emerald-400 tabular-nums">{summary.eligible}</p>
        </Card>
        <Card className="p-4 border border-amber-500/30 bg-amber-500/10">
          <span className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1">
            <AlertTriangle className="size-3.5" /> Condonation (75-84%)
          </span>
          <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400 tabular-nums">{summary.condonation}</p>
        </Card>
        <Card className="p-4 border border-rose-500/30 bg-rose-500/10">
          <span className="text-xs text-rose-600 dark:text-rose-400 font-medium flex items-center gap-1">
            <XCircle className="size-3.5" /> Withheld (&lt;75%)
          </span>
          <p className="text-2xl font-bold mt-1 text-rose-600 dark:text-rose-400 tabular-nums">{summary.withheld}</p>
        </Card>
      </div>

      {/* Control Panel */}
      <Card className="p-4 border bg-card/60 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <GraduationCap className="size-5 text-primary" /> Exam Eligibility Projection Controls
          </h3>
          <Badge variant="outline" className="text-xs font-normal">
            CHRIST University Exam Rules
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label htmlFor="end-date-picker" className="text-xs text-muted-foreground flex items-center gap-1">
              <Calendar className="size-3.5" /> Semester End / Last Instruction Date
            </Label>
            <Input
              id="end-date-picker"
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Assumed Attendance Rate for Future Classes</Label>
            <div className="flex items-center gap-1.5">
              {[100, 90, 85, 75, 0].map((rate) => (
                <Button
                  key={rate}
                  type="button"
                  variant={futureAttendanceRate === rate ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setFutureAttendanceRate(rate)}
                  className="text-xs h-9 flex-1 px-1"
                >
                  {rate}%
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-2.5 bg-muted/20 h-9">
            <Label htmlFor="include-yellow-forms-toggle" className="text-xs cursor-pointer font-medium">
              Include Pending Yellow Forms
            </Label>
            <Switch
              id="include-yellow-forms-toggle"
              checked={includePendingYellowForms}
              onCheckedChange={setIncludePendingYellowForms}
            />
          </div>
        </div>
      </Card>

      {/* Eligibility Matrix Table */}
      <Card className="border bg-card/60">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Subject Code & Name</TableHead>
              <TableHead>Current Attendance</TableHead>
              <TableHead>Future Classes</TableHead>
              <TableHead>Projected Final %</TableHead>
              <TableHead>Exam Eligibility Status</TableHead>
              <TableHead className="text-right">Safe Bunks Left</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {eligibilityMatrix.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  No active subjects found for current semester ({semester}).
                </TableCell>
              </TableRow>
            ) : (
              eligibilityMatrix.map(({ subject, baselineStats, projectedStats, futureTotal, status, safeBunksToEnd }: EligibilityMatrixItem) => {
                const currentPct = baselineStats.percentage !== null ? `${baselineStats.percentage.toFixed(1)}%` : '—'
                const projectedPct = projectedStats.percentage !== null ? `${projectedStats.percentage.toFixed(1)}%` : '—'

                return (
                  <TableRow key={subject.id}>
                    <TableCell className="font-medium">
                      {subject.faculty && (
                        <span className="font-mono text-[11px] text-muted-foreground block">{subject.faculty}</span>
                      )}
                      <span>{subject.name}</span>
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {currentPct} ({baselineStats.attended}/{baselineStats.total})
                    </TableCell>
                    <TableCell className="tabular-nums">
                      +{futureTotal} periods
                    </TableCell>
                    <TableCell className="font-bold tabular-nums text-sm">
                      {projectedPct}
                    </TableCell>
                    <TableCell>
                      {status === 'eligible' && (
                        <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-xs dark:text-emerald-400 font-semibold">
                          <CheckCircle2 className="size-3.5 text-emerald-500" /> Eligible (Hall Ticket Issued)
                        </Badge>
                      )}
                      {status === 'condonation' && (
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1 text-xs font-semibold">
                          <AlertTriangle className="size-3.5 text-amber-500" /> Condonation Needed (75-84%)
                        </Badge>
                      )}
                      {status === 'withheld' && (
                        <Badge variant="destructive" className="gap-1 text-xs font-semibold">
                          <XCircle className="size-3.5" /> Hall Ticket Withheld (&lt;75%)
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {safeBunksToEnd === Infinity ? 'Unlimited' : `${safeBunksToEnd} class${safeBunksToEnd === 1 ? '' : 'es'}`}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}
