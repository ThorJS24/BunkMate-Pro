import { useMemo, useState } from 'react'
import { Sparkles, TrendingDown, TrendingUp, CheckCircle, FileText, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { useSettingsStore } from '@/store/settings-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useAttendance } from '@/hooks/use-attendance'
import {
  computeAttendance,
  aggregateOverall,
  scheduledPeriodsForDates,
  projectRecords,
  computeClassesNeededToReachTarget,
} from '@/lib/attendance-engine'
import { todayIso } from '@/lib/date-utils'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function QuickImpactPredictor() {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const { subjects } = useSubjectsStore()
  const { slots } = useTimetableStore()
  const { records } = useAttendanceStore()
  const { holidays } = useHolidaysStore()
  const { overall: beforeOverall } = useAttendance(currentSemester || null)

  const today = todayIso()

  const [preset, setPreset] = useState<'tomorrow' | 'week' | 'next3'>('tomorrow')
  const [isYellowForm, setIsYellowForm] = useState(false)

  const targetDates = useMemo(() => {
    if (preset === 'tomorrow') {
      return [addDays(today, 1)]
    }
    if (preset === 'next3') {
      return [addDays(today, 1), addDays(today, 2), addDays(today, 3)]
    }
    // rest of week (until Saturday)
    const dates: string[] = []
    for (let i = 1; i <= 6; i++) {
      const dateIso = addDays(today, i)
      const jsDay = new Date(`${dateIso}T00:00:00Z`).getUTCDay()
      if (jsDay === 0) break // stop at Sunday
      dates.push(dateIso)
    }
    return dates
  }, [today, preset])

  const simulation = useMemo(() => {
    if (!currentSemester) return null

    const semesterSubjectIds = new Set(subjects.filter((s) => s.semester === currentSemester).map((s) => s.id))
    const currentRecords = records.filter((r) => semesterSubjectIds.has(r.subjectId))
    const currentSlots = slots.filter((s) => s.semester === currentSemester)

    const scheduled = scheduledPeriodsForDates({
      slots: currentSlots.map((s) => ({ ...s, period: s.period })),
      holidays: holidays.map((h) => ({ date: h.date, type: h.type })),
      dates: targetDates,
    })

    const statusToProject = isYellowForm ? 'present' : 'absent'
    const projected = projectRecords(scheduled, statusToProject)
    const combined = [...currentRecords, ...projected]

    const mapAfter = computeAttendance({
      records: combined,
      slots: currentSlots,
      holidays: holidays.map((h) => ({ date: h.date, type: h.type })),
      yellowForms: [],
      rules: [],
    })

    const overallAfter = aggregateOverall(mapAfter)
    const classesNeeded = computeClassesNeededToReachTarget(
      overallAfter.attended,
      overallAfter.total,
      overallMinTarget,
    )

    return {
      scheduledCount: scheduled.length,
      overallAfter,
      classesNeeded,
    }
  }, [currentSemester, subjects, records, slots, holidays, targetDates, isYellowForm, overallMinTarget])

  if (!currentSemester || !simulation) return null

  const beforePct = beforeOverall.percentage
  const afterPct = simulation.overallAfter.percentage
  const delta = (afterPct ?? 0) - (beforePct ?? 0)

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card via-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary animate-pulse" />
            <CardTitle className="text-base font-semibold">1-Click Attendance Impact Predictor</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="yf-mode"
              checked={isYellowForm}
              onCheckedChange={setIsYellowForm}
            />
            <Label htmlFor="yf-mode" className="text-xs cursor-pointer flex items-center gap-1 font-medium">
              {isYellowForm ? (
                <span className="text-success flex items-center gap-1">
                  <CheckCircle className="size-3.5" /> Yellow Form Approved
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1">
                  <FileText className="size-3.5" /> Planned Leave
                </span>
              )}
            </Label>
          </div>
        </div>
        <CardDescription className="text-xs">
          Simulate attendance impact instantly without copy-pasting into ChatGPT.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Preset chips */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={preset === 'tomorrow' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => setPreset('tomorrow')}
          >
            Tomorrow (1 day)
          </Button>
          <Button
            variant={preset === 'next3' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => setPreset('next3')}
          >
            Next 3 Days
          </Button>
          <Button
            variant={preset === 'week' ? 'default' : 'outline'}
            size="sm"
            className="h-7 text-xs rounded-full"
            onClick={() => setPreset('week')}
          >
            Rest of Week
          </Button>
        </div>

        {/* Before vs After Impact Box */}
        <div className="grid grid-cols-3 gap-3 rounded-lg border bg-card/60 p-3 text-center">
          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase">Current</p>
            <p className="text-lg font-bold">
              {beforePct === null ? '—' : `${beforePct.toFixed(1)}%`}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase">
              {isYellowForm ? 'With Yellow Form' : 'After Leave'}
            </p>
            <p className="text-lg font-bold text-foreground">
              {afterPct === null ? '—' : `${afterPct.toFixed(1)}%`}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-muted-foreground uppercase">Impact</p>
            <div className="flex items-center justify-center gap-1">
              {delta > 0 ? (
                <Badge variant="secondary" className="bg-success/15 text-success border-success/30">
                  <TrendingUp className="mr-1 size-3" /> +{delta.toFixed(1)}pp
                </Badge>
              ) : delta < 0 ? (
                <Badge variant="secondary" className="bg-destructive/15 text-destructive border-destructive/30">
                  <TrendingDown className="mr-1 size-3" /> {delta.toFixed(1)}pp
                </Badge>
              ) : (
                <Badge variant="outline">0.0pp</Badge>
              )}
            </div>
          </div>
        </div>

        {/* Insight & Recovery footer */}
        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1">
          <span className="flex items-center gap-1">
            <Info className="size-3.5 text-primary" />
            Covering {simulation.scheduledCount} scheduled period(s).
          </span>
          {simulation.classesNeeded > 0 ? (
            <span className="font-medium text-amber-600 dark:text-amber-400">
              Need {simulation.classesNeeded} class(es) to maintain {overallMinTarget}% target.
            </span>
          ) : (
            <span className="font-medium text-success">
              Safely above {overallMinTarget}% target!
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
