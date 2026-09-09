import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, FileWarning, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useLeavePlansStore } from '@/store/leave-plans-store'
import { useExamsStore } from '@/store/exams-store'
import { useDayMarking } from '@/hooks/use-day-marking'
import { NON_ATTENDANCE_TYPES } from '@/lib/period-marking'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { useToastStore } from '@/store/toast-store'
import { jsDayToWeekday, enumerateScheduledPeriods } from '@/lib/attendance-engine'
import { resolveDayPeriods, buildPeriodEndMinutesForDay, minutesSinceMidnight } from '@/lib/day-attendance'
import { todayIso } from '@/lib/date-utils'
import { HolidaysTab } from '@/pages/holidays-tab'
import { YellowFormsTab } from '@/pages/yellow-forms-tab'
import { YellowFormDisputeBadge } from '@/components/yellow-form-dispute'
import { QuickEsproSyncButton } from '@/components/quick-espro-sync'
import { cn } from '@/lib/utils'
import type { YellowForm } from '../../electron/db/repositories/yellow-forms'

const WEEKDAY_HEADERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

// A small colored dot for secondary day status in the month grid — swapped
// in for what used to be a pile of small text badges (holiday/leave/form/
// exam all stacked at once made a busy day unreadable). Only the two things
// worth a full number (class count, absences) still get real badge/text
// treatment; everything else is a glanceable dot with the detail in `title`.
function StatusDot({ className, title }: { className: string; title: string }) {
  return <span className={cn('size-2 shrink-0 rounded-full ring-1 ring-black/10', className)} title={title} />
}

interface DayCell {
  iso: string
  day: number
  inMonth: boolean
}

function buildMonthGrid(year: number, month: number): DayCell[] {
  const startWeekday = new Date(Date.UTC(year, month, 1)).getUTCDay()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
  const daysInPrevMonth = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  const cells: DayCell[] = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1
    if (dayNum < 1) {
      const day = daysInPrevMonth + dayNum
      const d = new Date(Date.UTC(year, month - 1, day))
      cells.push({ iso: toIso(d.getUTCFullYear(), d.getUTCMonth(), day), day, inMonth: false })
    } else if (dayNum > daysInMonth) {
      const day = dayNum - daysInMonth
      const d = new Date(Date.UTC(year, month + 1, day))
      cells.push({ iso: toIso(d.getUTCFullYear(), d.getUTCMonth(), day), day, inMonth: false })
    } else {
      cells.push({ iso: toIso(year, month, dayNum), day: dayNum, inMonth: true })
    }
  }
  return cells
}

function CalendarGrid() {
  const today = todayIso()
  const [cursor, setCursor] = useState(() => {
    const [y, m] = today.split('-').map(Number)
    return { year: y, month: m - 1 }
  })
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const { subjects, load: loadSubjects } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const { slots, load: loadSlots } = useTimetableStore()
  const { records, load: loadRecords } = useAttendanceStore()
  const { holidays, load: loadHolidays, create: createHoliday, remove: removeHoliday } = useHolidaysStore()
  const { exams, load: loadExams } = useExamsStore()
  const { plans, load: loadPlans } = useLeavePlansStore()
  const {
    forms: yellowForms,
    load: loadYellowForms,
    create: createYellowForm,
    remove: removeYellowForm,
  } = useYellowFormsStore()
  const pushToast = useToastStore((s) => s.push)

  const [yellowFormDialogOpen, setYellowFormDialogOpen] = useState(false)
  const [yellowFormScope, setYellowFormScope] = useState<'day' | 'period'>('day')
  const [yellowFormPeriod, setYellowFormPeriod] = useState('')
  const [yellowFormReason, setYellowFormReason] = useState('')
  const [filingYellowForm, setFilingYellowForm] = useState(false)
  const [yellowFormDeleteTarget, setYellowFormDeleteTarget] = useState<YellowForm | null>(null)
  const [removingYellowForm, setRemovingYellowForm] = useState(false)
  const [markingAll, setMarkingAll] = useState<'present' | 'absent' | null>(null)
  const [rangeOpen, setRangeOpen] = useState(false)
  const [rangeFrom, setRangeFrom] = useState('')
  const [rangeTo, setRangeTo] = useState('')
  const [rangeStatus, setRangeStatus] = useState<'present' | 'absent'>('present')
  const [rangeMarking, setRangeMarking] = useState(false)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadRecords()
    loadHolidays()
    loadPlans()
    loadYellowForms()
  }, [loadSubjects, loadRecords, loadHolidays, loadPlans, loadYellowForms])

  useEffect(() => {
    if (currentSemester) loadExams({ semester: currentSemester })
  }, [loadExams, currentSemester])

  useEffect(() => {
    if (currentSemester) loadSlots(currentSemester)
  }, [loadSlots, currentSemester])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const holidaysByDate = useMemo(() => new Map(holidays.map((h) => [h.date, h])), [holidays])
  const examsByDate = useMemo(() => {
    const map = new Map<string, typeof exams>()
    for (const e of exams) {
      const list = map.get(e.date) ?? []
      list.push(e)
      map.set(e.date, list)
    }
    return map
  }, [exams])
  const recordsByDate = useMemo(() => {
    const map = new Map<string, typeof records>()
    for (const r of records) {
      const list = map.get(r.date) ?? []
      list.push(r)
      map.set(r.date, list)
    }
    return map
  }, [records])
  const leaveDates = useMemo(() => {
    const set = new Set<string>()
    for (const plan of plans) {
      if (plan.status === 'cancelled') continue
      for (const d of plan.dates) set.add(d)
    }
    return set
  }, [plans])

  const cells = useMemo(() => buildMonthGrid(cursor.year, cursor.month), [cursor])

  function slotsForDate(iso: string) {
    const weekday = jsDayToWeekday(iso)
    if (!weekday) return []
    return slots.filter((s) => s.day === weekday)
  }

  const selected = selectedDate
    ? {
        iso: selectedDate,
        holiday: holidaysByDate.get(selectedDate),
        slots: slotsForDate(selectedDate),
        records: recordsByDate.get(selectedDate) ?? [],
        onLeave: leaveDates.has(selectedDate),
      }
    : null

  // Classifies each of the selected day's periods so already-finished,
  // unmarked classes can be flagged as auto-present the same way the
  // attendance engine now counts them (see day-attendance.ts).
  const dayPeriodStatusBySlot = useMemo(() => {
    if (!selectedDate) return new Map<number, ReturnType<typeof resolveDayPeriods>[number]['effectiveStatus']>()
    const weekday = jsDayToWeekday(selectedDate)
    if (!weekday) return new Map()
    const daySlots = slots.filter((s) => s.day === weekday)
    const dayRecords = recordsByDate.get(selectedDate) ?? []
    const periodEndMinutes = buildPeriodEndMinutesForDay(slots, weekday)
    const resolved = resolveDayPeriods({
      scheduledPeriods: daySlots.map((s) => ({
        date: selectedDate,
        day: weekday,
        period: s.period,
        subjectId: s.subjectId,
        type: s.type,
        slotId: s.id,
      })),
      records: dayRecords,
      todayIso: todayIso(),
      nowMinutes: minutesSinceMidnight(new Date()),
      periodEndMinutes,
    })
    return new Map(resolved.map((p) => [p.slotId, p.effectiveStatus]))
  }, [selectedDate, slots, recordsByDate])

  // Attendance marking (per-period + batch) is shared with the Today view via
  // useDayMarking so the create/update/undo behaviour lives in one place.
  const { writeAttendance: markWrite, toggle: markToggle } = useDayMarking()

  async function toggleAttendance(subjectId: number, slotId: number, status: 'present' | 'absent') {
    if (!selectedDate) return
    await markToggle(selectedDate, subjectId, slotId, status)
  }

  // Periods "Mark all" writes: everything except meeting and lunch, matching
  // the per-period Present/Absent buttons. The subject guard is a hard
  // requirement (an attendance record can't exist without a subjectId), not
  // a type exclusion — a subject-bearing mentoring/minor period is markable
  // just like a class one.
  const markableSlots = (selected?.slots ?? []).filter(
    (s) => !NON_ATTENDANCE_TYPES.includes(s.type) && s.subjectId !== null,
  )

  async function markWholeDay(status: 'present' | 'absent') {
    if (markableSlots.length === 0) return
    setMarkingAll(status)
    try {
      const undos: (() => Promise<void>)[] = []
      for (const slot of markableSlots) {
        if (!selectedDate) continue
        undos.push(await markWrite(selectedDate, slot.subjectId as number, slot.id, status))
      }
      pushToast({
        title: `Marked ${markableSlots.length} period${markableSlots.length === 1 ? '' : 's'} ${status}`,
        description: selectedDate ?? undefined,
        action: {
          label: 'Undo',
          onClick: () => {
            // Undo in reverse so a create-then-nothing sequence unwinds cleanly.
            void (async () => {
              for (const undo of undos.reverse()) await undo()
            })()
          },
        },
      })
    } finally {
      setMarkingAll(null)
    }
  }

  async function markRange() {
    if (!rangeFrom || !rangeTo || rangeFrom > rangeTo) {
      pushToast({ title: 'Invalid range', description: 'Pick a start date on or before the end date.' })
      return
    }
    setRangeMarking(true)
    try {
      // enumerateScheduledPeriods expands the recurring timetable into concrete
      // dated periods and already skips holiday-excluded dates. Only mark
      // subject-bearing, attendance-counting periods.
      const periods = enumerateScheduledPeriods({
        slots: slots.map((s) => ({ id: s.id, subjectId: s.subjectId, type: s.type, day: s.day, period: s.period })),
        holidays,
        startDate: rangeFrom,
        endDate: rangeTo,
      }).filter((p) => p.subjectId !== null && !NON_ATTENDANCE_TYPES.includes(p.type))

      for (const p of periods) {
        await markWrite(p.date, p.subjectId as number, p.slotId, rangeStatus)
      }
      pushToast({
        title: `Marked ${periods.length} period${periods.length === 1 ? '' : 's'} ${rangeStatus}`,
        description: `${rangeFrom} → ${rangeTo} (holidays skipped)`,
      })
      setRangeOpen(false)
    } finally {
      setRangeMarking(false)
    }
  }

  const eligibleYellowFormSlots = (selected?.slots ?? []).filter((s) => s.type !== 'lunch' && s.subjectId !== null)

  function yellowFormFor(subjectId: number, period: number) {
    if (!selectedDate) return undefined
    return yellowForms.find((f) => f.date === selectedDate && f.subjectId === subjectId && f.period === period)
  }

  function openYellowFormDialog() {
    setYellowFormScope('day')
    setYellowFormPeriod(eligibleYellowFormSlots[0] ? String(eligibleYellowFormSlots[0].period) : '')
    setYellowFormReason('')
    setYellowFormDialogOpen(true)
  }

  /** One-click entry point from a specific class row: opens the same filing
   * dialog already scoped to just that period, so filing for one class is a
   * click + a reason rather than a hunt through the whole-day dialog. */
  function openYellowFormForPeriod(period: number) {
    setYellowFormScope('period')
    setYellowFormPeriod(String(period))
    setYellowFormReason('')
    setYellowFormDialogOpen(true)
  }

  async function handleFileYellowForm() {
    if (!selectedDate) return
    const targets =
      yellowFormScope === 'day'
        ? eligibleYellowFormSlots.filter((s) => !yellowFormFor(s.subjectId as number, s.period))
        : (() => {
            const period = Number(yellowFormPeriod)
            const slot = eligibleYellowFormSlots.find((s) => s.period === period)
            if (!slot || yellowFormFor(slot.subjectId as number, slot.period)) return []
            return [slot]
          })()

    if (targets.length === 0) {
      pushToast({
        title: 'Nothing to file',
        description: 'Every eligible period for this selection already has a yellow form.',
      })
      return
    }

    setFilingYellowForm(true)
    try {
      for (const slot of targets) {
        await createYellowForm({
          date: selectedDate,
          subjectId: slot.subjectId as number,
          period: slot.period,
          reason: yellowFormReason.trim() || null,
        })
      }
      pushToast({ title: `Filed ${targets.length} yellow form${targets.length === 1 ? '' : 's'}` })
      setYellowFormDialogOpen(false)
    } finally {
      setFilingYellowForm(false)
    }
  }

  async function handleRemoveYellowForm() {
    if (!yellowFormDeleteTarget) return
    setRemovingYellowForm(true)
    try {
      await removeYellowForm(yellowFormDeleteTarget.id)
      pushToast({ title: 'Yellow form retracted' })
      setYellowFormDeleteTarget(null)
    } finally {
      setRemovingYellowForm(false)
    }
  }

  async function toggleHoliday() {
    if (!selectedDate) return
    if (selected?.holiday) {
      await removeHoliday(selected.holiday.id)
      pushToast({ title: 'Holiday removed' })
    } else {
      await createHoliday({ date: selectedDate, type: 'custom', label: null })
      pushToast({ title: 'Marked as holiday' })
    }
  }


  return (
    <div className="space-y-4">
      {/* Month Navigation & Hero Toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">
              {new Date(cursor.year, cursor.month).toLocaleString('default', { month: 'long', year: 'numeric' })}
            </h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
              {currentSemester ?? 'Academic Calendar'}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Monthly schedule view with exam dates, holidays, leave plans, and period attendance tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SemesterSwitcher />
          <QuickEsproSyncButton variant="outline" size="sm" />
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor((prev) =>
                prev.month === 0 ? { year: prev.year - 1, month: 11 } : { ...prev, month: prev.month - 1 },
              )
            }
          >
            <ChevronLeft className="size-4 mr-1" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const [y, m] = today.split('-').map(Number)
              setCursor({ year: y, month: m - 1 })
            }}
          >
            Today
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              setCursor((prev) =>
                prev.month === 11 ? { year: prev.year + 1, month: 0 } : { ...prev, month: prev.month + 1 },
              )
            }
          >
            Next <ChevronRight className="size-4 ml-1" />
          </Button>
          <Button
            variant="default"
            size="sm"
            onClick={() => {
              setRangeFrom(todayIso())
              setRangeTo(todayIso())
              setRangeStatus('present')
              setRangeOpen(true)
            }}
          >
            Mark Date Range
          </Button>
        </div>
      </div>

      {/* Month Legend & Indicators */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card/50 p-3 text-xs">
        <div className="flex flex-wrap items-center gap-4 text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <StatusDot className="bg-emerald-500" title="Holiday" /> Holiday / Off
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot className="bg-amber-500" title="Yellow Form" /> Yellow Form
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot className="bg-blue-500" title="Blue Form" /> Blue Form
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot className="bg-rose-500" title="Exam" /> Exam
          </span>
          <span className="flex items-center gap-1.5">
            <StatusDot className="bg-purple-500" title="Leave" /> Leave Plan
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="font-normal text-[11px]">
            {cells.filter((c) => c.inMonth).length} Days in Month
          </Badge>
        </div>
      </div>

      {/* Month Calendar Matrix */}
      <div className="grid grid-cols-7 gap-2">
        {WEEKDAY_HEADERS.map((label) => (
          <div key={label} className="p-2 text-center text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {label}
          </div>
        ))}
        {cells.map((cell) => {
          const holiday = holidaysByDate.get(cell.iso)
          const dayRecords = recordsByDate.get(cell.iso) ?? []
          const scheduled = cell.inMonth ? slotsForDate(cell.iso) : []
          const onLeave = leaveDates.has(cell.iso)
          const dayExams = cell.inMonth ? (examsByDate.get(cell.iso) ?? []) : []
          const dayYellowForms = cell.inMonth ? yellowForms.filter((f) => f.date === cell.iso) : []
          const hasBlueForm = dayYellowForms.some((f) => f.reason?.toLowerCase().includes('blue form'))
          const hasYellowForm = dayYellowForms.length > 0 && !hasBlueForm

          const absentCount = dayRecords.filter((r) => r.status === 'absent').length
          const presentCount = dayRecords.filter((r) => r.status === 'present').length

          return (
            <button
              key={cell.iso}
              type="button"
              onClick={() => setSelectedDate(cell.iso)}
              className={cn(
                'flex h-24 flex-col items-stretch justify-between rounded-xl border p-2.5 text-left transition-all duration-150 bg-card hover:border-primary/50 hover:shadow-md',
                !cell.inMonth && 'opacity-35 bg-muted/20',
                holiday && holiday.type !== 'working_saturday' && 'bg-emerald-500/10 border-emerald-500/30',
                cell.iso === todayIso() && 'ring-2 ring-primary shadow-sm',
              )}
            >
              <div className="flex items-center justify-between">
                <span className={cn('text-sm font-semibold', cell.iso === todayIso() && 'text-primary font-bold')}>
                  {cell.day}
                </span>
                <div className="flex items-center gap-1">
                  {holiday && (
                    <StatusDot
                      className={holiday.type === 'working_saturday' ? 'bg-primary' : 'bg-emerald-500'}
                      title={holiday.type === 'working_saturday' ? 'Working Saturday' : `Holiday: ${holiday.label ?? holiday.type}`}
                    />
                  )}
                  {onLeave && <StatusDot className="bg-purple-500" title="Part of a leave plan" />}
                  {hasYellowForm && <StatusDot className="bg-amber-500" title="Yellow form filed" />}
                  {hasBlueForm && <StatusDot className="bg-blue-500" title="Blue form filed" />}
                  {dayExams.length > 0 && (
                    <StatusDot
                      className="bg-rose-500"
                      title={dayExams.length === 1 ? '1 exam' : `${dayExams.length} exams`}
                    />
                  )}
                </div>
              </div>

              {/* Day Event Summary Badges */}
              <div className="flex flex-col gap-1 mt-1">
                {dayExams.length > 0 && (
                  <Badge variant="destructive" className="px-1.5 py-0 text-[10px] truncate max-w-full font-medium">
                    📝 {dayExams[0].name}
                  </Badge>
                )}
                {holiday && (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium truncate">
                    🌴 {holiday.label || 'Holiday'}
                  </span>
                )}
              </div>

              <div className="mt-auto flex items-end justify-between gap-1 pt-1">
                {!holiday && scheduled.length > 0 ? (
                  <span className="text-[10px] text-muted-foreground">
                    {scheduled.length} class{scheduled.length === 1 ? '' : 'es'}
                  </span>
                ) : (
                  <span />
                )}
                {dayRecords.length > 0 &&
                  (absentCount > 0 ? (
                    <Badge variant="destructive" className="px-1.5 py-0 text-[10px]">
                      {absentCount} absent
                    </Badge>
                  ) : (
                    <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      {presentCount}/{dayRecords.length} Present
                    </span>
                  ))}
              </div>
            </button>
          )
        })}
      </div>

      <Dialog open={selected !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selected?.iso}</DialogTitle>
            <DialogDescription>
              {selected?.onLeave && 'Part of a saved leave plan. '}
              {selected?.holiday
                ? `Holiday: ${selected.holiday.label ?? selected.holiday.type}`
                : 'Not marked as a holiday.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 border-b pb-4">
            <Button type="button" variant="outline" size="sm" onClick={toggleHoliday} className="w-fit">
              {selected?.holiday ? 'Remove holiday' : 'Mark as holiday'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={openYellowFormDialog}
              disabled={eligibleYellowFormSlots.length === 0}
              className="w-fit"
            >
              <FileWarning /> File yellow form
            </Button>
          </div>

          {selectedDate && (examsByDate.get(selectedDate)?.length ?? 0) > 0 && (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <h3 className="text-sm font-semibold text-destructive">Exams</h3>
              {examsByDate.get(selectedDate)?.map((exam) => (
                <p key={exam.id} className="text-sm">
                  {exam.name}
                  {exam.subjectId && subjectsById.get(exam.subjectId) && (
                    <span className="text-muted-foreground"> · {subjectsById.get(exam.subjectId)?.name}</span>
                  )}
                  {exam.notes && <span className="text-muted-foreground"> · {exam.notes}</span>}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2 border-t pt-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Scheduled periods</h3>
              {markableSlots.length > 0 && (
                <div className="flex items-center gap-1">
                  <span className="mr-1 text-xs text-muted-foreground">Mark all:</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={markingAll !== null}
                    onClick={() => markWholeDay('present')}
                  >
                    Present
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={markingAll !== null}
                    onClick={() => markWholeDay('absent')}
                  >
                    Absent
                  </Button>
                </div>
              )}
            </div>
            {selected?.slots.length === 0 && (
              <p className="text-sm text-muted-foreground">No periods scheduled.</p>
            )}
            {selected?.slots.map((slot) => {
              const subjectName = slot.subjectId ? subjectsById.get(slot.subjectId)?.name : slot.type
              const record = selected.records.find(
                (r) => r.subjectId === slot.subjectId && r.period === slot.period,
              )
              const isLunch = slot.type === 'lunch'
              const yellowForm = slot.subjectId !== null ? yellowFormFor(slot.subjectId, slot.period) : undefined
              const autoPresent = !record && dayPeriodStatusBySlot.get(slot.id) === 'auto_present'
              return (
                <div key={slot.id} className="rounded-md border p-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-medium">P{slot.period} · {subjectName ?? slot.type}</span>
                      {autoPresent && <Badge variant="outline">Auto-present</Badge>}
                      {yellowForm && (
                        <Badge
                          variant={
                            yellowForm.status === 'approved'
                              ? 'success'
                              : yellowForm.status === 'rejected'
                                ? 'destructive'
                                : 'warning'
                          }
                        >
                          Yellow form: {yellowForm.status}
                        </Badge>
                      )}
                      {yellowForm && yellowForm.status !== 'pending' && (
                        <YellowFormDisputeBadge form={yellowForm} subjectName={subjectName ?? slot.type} />
                      )}
                    </span>
                    {!isLunch && slot.subjectId !== null && (
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant={record?.status === 'present' || autoPresent ? 'default' : 'outline'}
                          onClick={() => toggleAttendance(slot.subjectId as number, slot.id, 'present')}
                        >
                          Present
                        </Button>
                        <Button
                          size="sm"
                          variant={record?.status === 'absent' ? 'destructive' : 'outline'}
                          onClick={() => toggleAttendance(slot.subjectId as number, slot.id, 'absent')}
                        >
                          Absent
                        </Button>
                        {!yellowForm && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title="File a yellow form for this class"
                            aria-label={`File a yellow form for P${slot.period}`}
                            onClick={() => openYellowFormForPeriod(slot.period)}
                          >
                            <FileWarning className="size-4" />
                          </Button>
                        )}
                        {yellowForm && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="size-8"
                            title="Retract this yellow form"
                            aria-label={`Retract the yellow form for P${slot.period}`}
                            onClick={() => setYellowFormDeleteTarget(yellowForm)}
                          >
                            <X className="size-4" />
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                  {!isLunch && slot.subjectId === null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      No subject assigned to this period. Assign one in Timetable to mark attendance.
                    </p>
                  )}
                  {slot.type === 'meeting' && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Excluded from attendance % (meetings don't count toward totals), but still logged.
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={yellowFormDialogOpen} onOpenChange={setYellowFormDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>File yellow form</DialogTitle>
            <DialogDescription>
              {selected?.iso}. Periods that already have a yellow form are skipped automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="yf-scope">Scope</Label>
            <Select value={yellowFormScope} onValueChange={(v) => setYellowFormScope(v as 'day' | 'period')}>
              <SelectTrigger id="yf-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="day">Whole day</SelectItem>
                <SelectItem value="period">Specific period</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {yellowFormScope === 'period' && (
            <div className="space-y-2">
              <Label htmlFor="yf-period">Period</Label>
              <Select value={yellowFormPeriod} onValueChange={setYellowFormPeriod}>
                <SelectTrigger id="yf-period">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {eligibleYellowFormSlots.map((slot) => {
                    const alreadyFiled = !!yellowFormFor(slot.subjectId as number, slot.period)
                    const subjectName = subjectsById.get(slot.subjectId as number)?.name
                    return (
                      <SelectItem key={slot.id} value={String(slot.period)} disabled={alreadyFiled}>
                        P{slot.period} · {subjectName}
                        {alreadyFiled ? ' (already filed)' : ''}
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="yf-reason">Reason (optional)</Label>
            <Input
              id="yf-reason"
              value={yellowFormReason}
              onChange={(e) => setYellowFormReason(e.target.value)}
              placeholder="Medical, on-duty, etc."
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setYellowFormDialogOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleFileYellowForm} disabled={filingYellowForm}>
              File
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={yellowFormDeleteTarget !== null} onOpenChange={(open) => !open && setYellowFormDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Retract this yellow form?</DialogTitle>
            <DialogDescription>
              {yellowFormDeleteTarget && (
                <>
                  P{yellowFormDeleteTarget.period} on {yellowFormDeleteTarget.date}, currently{' '}
                  <span className="font-medium">{yellowFormDeleteTarget.status}</span>. This deletes the form (and any
                  dispute on it) completely, including if it's already been approved or rejected. This can't be
                  undone.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setYellowFormDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveYellowForm} disabled={removingYellowForm}>
              Retract
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={rangeOpen} onOpenChange={setRangeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark a date range</DialogTitle>
            <DialogDescription>
              Marks every scheduled class (holidays skipped, lunch/meeting excluded) between two dates. Existing
              records in the range are updated to match.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="range-from">From</Label>
              <Input id="range-from" type="date" value={rangeFrom} onChange={(e) => setRangeFrom(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="range-to">To</Label>
              <Input id="range-to" type="date" value={rangeTo} onChange={(e) => setRangeTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="range-status">Mark as</Label>
            <Select value={rangeStatus} onValueChange={(v) => setRangeStatus(v as 'present' | 'absent')}>
              <SelectTrigger id="range-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="present">Present</SelectItem>
                <SelectItem value="absent">Absent</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRangeOpen(false)}>
              Cancel
            </Button>
            <Button onClick={markRange} disabled={rangeMarking}>
              Mark range
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function CalendarPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Calendar</h1>
      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="holidays">Holidays</TabsTrigger>
          <TabsTrigger value="yellow-forms">Yellow Forms</TabsTrigger>
        </TabsList>
        <TabsContent value="calendar" className="pt-4">
          <Card>
            <CardContent className="pt-6">
              <CalendarGrid />
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="holidays" className="pt-4">
          <HolidaysTab />
        </TabsContent>
        <TabsContent value="yellow-forms" className="pt-4">
          <YellowFormsTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
