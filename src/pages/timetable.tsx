import { useEffect, useMemo, useState } from 'react'
import { Trash2, Settings2, TriangleAlert, CopyPlus, CalendarRange, Table2, Import, Eraser, CalendarPlus, FileUp, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Card } from '@/components/ui/card'
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
import { useTimetableStore } from '@/store/timetable-store'
import { useSettingsStore } from '@/store/settings-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useToastStore } from '@/store/toast-store'
import { WEEKDAYS, PERIOD_TYPES, type Weekday, type PeriodType, type PeriodTime } from '@/db/schema'
import type { TimetableSlot } from '../../electron/db/repositories/timetable-slots'
import { validateTimetableDay } from '@/lib/timetable-rules'
import { allocateEvenPeriodTimes } from '@/lib/period-time-allocation'
import { friendlyError } from '@/lib/friendly-error'
import { planDragDrop } from '@/lib/timetable-drag'
import { planTimetableCopy } from '@/lib/timetable-copy'
import { buildTimetableIcs } from '@/lib/timetable-ics'
import { parseIcs } from '@/lib/ics-parser'
import { planIcsTimetableImport, type IcsTimetableImportPlan } from '@/lib/timetable-ics-import'
import { TimetableWeekGlance } from '@/components/timetable-week-glance'
import { IcsUrlImportButton } from '@/components/ics-url-import-button'
import { resolveSubjectColor } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

import { getPeriodDisplayLabel } from '@/lib/period-display'

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

const TYPE_VARIANT: Record<PeriodType, 'default' | 'secondary' | 'outline' | 'success' | 'warning'> = {
  class: 'default',
  project: 'secondary',
  mentoring: 'secondary',
  minor: 'secondary',
  meeting: 'warning',
  lunch: 'outline',
}

// 'project' is retired: project work is now scheduled as a real Subject
// (type 'class'), not a separate typeless bucket. Kept in PERIOD_TYPES/the
// schema/the attendance engine's bucket table so existing slots still typed
// 'project' keep working until reassigned via the banner below — this list
// only controls what's offered for NEW selections.
const SELECTABLE_PERIOD_TYPES = PERIOD_TYPES.filter((t) => t !== 'project')

// class is the only type that's actually about a subject. lunch, meeting,
// mentoring, and minor are all genuinely typeless — no subject to attach —
// and project (retired, kept only for legacy slots) was typeless too before
// project work moved to being scheduled as a real Subject.
const TYPES_WITHOUT_SUBJECT: PeriodType[] = ['lunch', 'meeting', 'mentoring', 'minor', 'project']

interface CellFormState {
  subjectId: string
  type: PeriodType
  startTime: string
  endTime: string
}

export function TimetablePage() {
  const semester = useSettingsStore((s) => s.currentSemester)
  const { subjects, load: loadSubjects, create: createSubject } = useSubjectsStore()
  const { slots, load, create, update, remove } = useTimetableStore()
  const { semesters, load: loadSemesters, update: updateSemester } = useSemestersStore()
  const pushToast = useToastStore((s) => s.push)

  const [dialogTarget, setDialogTarget] = useState<{ day: Weekday; period: number } | null>(null)
  const [form, setForm] = useState<CellFormState>({ subjectId: 'none', type: 'class', startTime: '', endTime: '' })
  const [saving, setSaving] = useState(false)
  const [gridSettingsOpen, setGridSettingsOpen] = useState(false)
  const [gridForm, setGridForm] = useState({
    periodsPerDay: '7',
    lunchPeriod: '5',
    dayStartTime: '',
    dayEndTime: '',
  })
  // Only set once "Auto-allocate times" succeeds in the currently-open
  // dialog session — kept separate from the semester's saved periodTimes so
  // editing periodsPerDay/lunchPeriod without re-running allocation doesn't
  // overwrite the existing (still valid until reassigned) stored times.
  const [pendingPeriodTimes, setPendingPeriodTimes] = useState<PeriodTime[] | null>(null)
  const [reassignOpen, setReassignOpen] = useState(false)
  const [reassignChoice, setReassignChoice] = useState<Record<number, string>>({})
  const [copyDayOpen, setCopyDayOpen] = useState(false)
  const [copySourceDay, setCopySourceDay] = useState<Weekday>('mon')
  const [copyTargetDays, setCopyTargetDays] = useState<Partial<Record<Weekday, boolean>>>({})
  const [copying, setCopying] = useState(false)
  const [view, setView] = useState<'grid' | 'week'>('grid')
  const [copyFromOpen, setCopyFromOpen] = useState(false)
  const [copyFromSemesterLabel, setCopyFromSemesterLabel] = useState('')
  const [copyingFrom, setCopyingFrom] = useState(false)
  const [clearDayTarget, setClearDayTarget] = useState<Weekday | null>(null)
  const [importTimetableOpen, setImportTimetableOpen] = useState(false)
  const [importPlan, setImportPlan] = useState<IcsTimetableImportPlan | null>(null)
  const [importSource, setImportSource] = useState('')
  const [importingTimetable, setImportingTimetable] = useState(false)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadSemesters()
  }, [loadSubjects, loadSemesters])

  useEffect(() => {
    if (semester) load(semester)
  }, [load, semester])

  const activeSemester = useMemo(() => semesters.find((s) => s.label === semester), [semesters, semester])
  const periodsPerDay = activeSemester?.periodsPerDay ?? 7
  const lunchPeriod = activeSemester?.lunchPeriod ?? 4
  const PERIODS = useMemo(() => Array.from({ length: periodsPerDay }, (_, i) => i + 1), [periodsPerDay])

  const periodTimeByPeriod = useMemo(
    () => new Map((activeSemester?.periodTimes ?? []).map((pt) => [pt.period, pt])),
    [activeSemester],
  )

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // A subject's own chosen color if set, else a stable palette slot by id
  // order — matching how Week overview and Analytics color subjects, so the
  // editable grid doesn't disagree with either.
  const colorBySubjectId = useMemo(() => {
    const sorted = [...subjects].sort((a, b) => a.id - b.id)
    return new Map(sorted.map((s, i) => [s.id, resolveSubjectColor(s.color, i)]))
  }, [subjects])

  // Slots still using the retired 'project' type, for this semester — the
  // reassignment banner's whole reason to exist. Sorted so the list reads
  // top-to-bottom the same way the grid does.
  const projectSlots = useMemo(
    () =>
      slots
        .filter((s) => s.type === 'project')
        .sort((a, b) => a.period - b.period || WEEKDAYS.indexOf(a.day) - WEEKDAYS.indexOf(b.day)),
    [slots],
  )

  async function reassignSlot(slot: TimetableSlot) {
    const subjectId = Number(reassignChoice[slot.id])
    if (!subjectId) return
    await update(slot.id, { type: 'class', subjectId })
    setReassignChoice((prev) => {
      const next = { ...prev }
      delete next[slot.id]
      return next
    })
    pushToast({ title: 'Period reassigned', description: `${DAY_LABELS[slot.day]} · Period ${slot.period}` })
  }

  async function copyDay() {
    const sourceSlots = slots.filter((s) => s.day === copySourceDay)
    const sourceDaySlots = sourceSlots.map((s) => ({ period: s.period, type: s.type }))
    const targets = WEEKDAYS.filter((d) => copyTargetDays[d] && d !== copySourceDay)
    if (targets.length === 0) return

    setCopying(true)
    try {
      const skipped: Weekday[] = []
      for (const targetDay of targets) {
        const validation = validateTimetableDay(sourceDaySlots, { maxTeachingPeriods: periodsPerDay })
        if (!validation.ok) {
          skipped.push(targetDay)
          continue
        }
        // A copy replaces the target day outright — clear anything there
        // that the source day doesn't also have at that period, then
        // upsert every source slot onto it (createTimetableSlot already
        // upserts on semester/day/period, so matching periods just update).
        const sourcePeriods = new Set(sourceSlots.map((s) => s.period))
        const staleOnTarget = slots.filter((s) => s.day === targetDay && !sourcePeriods.has(s.period))
        for (const stale of staleOnTarget) await remove(stale.id)
        for (const s of sourceSlots) {
          await create({
            semester,
            day: targetDay,
            period: s.period,
            subjectId: s.subjectId,
            type: s.type,
            startTime: s.startTime,
            endTime: s.endTime,
          })
        }
      }
      const copiedTo = targets.filter((d) => !skipped.includes(d))
      if (copiedTo.length > 0) {
        pushToast({
          title: 'Day copied',
          description: `${DAY_LABELS[copySourceDay]} → ${copiedTo.map((d) => DAY_LABELS[d]).join(', ')}`,
        })
      }
      if (skipped.length > 0) {
        pushToast({
          title: "Couldn't copy to every target",
          description: `${skipped.map((d) => DAY_LABELS[d]).join(', ')} would exceed the ${periodsPerDay}-period cap.`,
        })
      }
      setCopyDayOpen(false)
      setCopyTargetDays({})
    } finally {
      setCopying(false)
    }
  }

  // Semesters other than the current one, as copy sources.
  const otherSemesters = useMemo(
    () => semesters.filter((s) => s.label !== semester).sort((a, b) => a.number - b.number),
    [semesters, semester],
  )

  async function copyFromSemester() {
    if (!copyFromSemesterLabel) return
    setCopyingFrom(true)
    try {
      const sourceSlots = await window.bunkmate.timetableSlots.list({ semester: copyFromSemesterLabel })
      const plan = planTimetableCopy({
        sourceSlots: sourceSlots.map((s) => ({
          day: s.day,
          period: s.period,
          type: s.type,
          subjectId: s.subjectId,
          startTime: s.startTime,
          endTime: s.endTime,
        })),
        sourceSubjectNames: new Map(
          subjects.filter((s) => s.semester === copyFromSemesterLabel).map((s) => [s.id, s.name]),
        ),
        targetSubjectIdsByName: new Map(
          subjects.filter((s) => s.semester === semester).map((s) => [s.name, s.id]),
        ),
        occupiedTargetCells: new Set(slots.map((s) => `${s.day}:${s.period}`)),
        maxPeriod: periodsPerDay,
      })

      for (const s of plan.toCreate) {
        await create({ semester, ...s })
      }

      if (plan.toCreate.length === 0) {
        pushToast({ title: 'Nothing to copy', description: 'Every matching cell is already filled.' })
      } else {
        pushToast({
          title: `Copied ${plan.toCreate.length} period${plan.toCreate.length === 1 ? '' : 's'} from ${copyFromSemesterLabel}`,
          description:
            (plan.skipped > 0 ? `${plan.skipped} skipped (occupied or out of range). ` : '') +
            (plan.unmatchedSubjects.length > 0
              ? `No subject match for: ${plan.unmatchedSubjects.join(', ')}. Reassign them.`
              : ''),
        })
      }
      setCopyFromOpen(false)
      setCopyFromSemesterLabel('')
    } finally {
      setCopyingFrom(false)
    }
  }

  async function clearDay(day: Weekday) {
    const daySlots = slots.filter((s) => s.day === day)
    for (const s of daySlots) await remove(s.id)
    setClearDayTarget(null)
    pushToast({
      title: `Cleared ${DAY_LABELS[day]}`,
      description: `${daySlots.length} period${daySlots.length === 1 ? '' : 's'} removed`,
    })
  }

  // ICS export needs real clock times (period times). Gate the button on
  // them so the user gets the same graceful "set times first" message as the
  // reminders feature, rather than an empty calendar.
  const hasPeriodTimes = (activeSemester?.periodTimes?.length ?? 0) > 0

  async function exportIcs() {
    if (!activeSemester) return
    const ics = buildTimetableIcs({
      slots: slots.map((s) => {
        const time = periodTimeByPeriod.get(s.period)
        return {
          day: s.day,
          period: s.period,
          type: s.type,
          subjectName: s.subjectId !== null ? (subjectsById.get(s.subjectId)?.name ?? null) : null,
          startTime: time?.startTime ?? s.startTime,
          endTime: time?.endTime ?? s.endTime,
        }
      }),
      semesterLabel: activeSemester.label,
      startDate: activeSemester.startDate,
      endDate: activeSemester.endDate,
    })
    const savedPath = await window.bunkmate.files.saveFile({
      defaultName: `timetable-${activeSemester.label}.ics`,
      content: ics,
      filters: [{ name: 'iCalendar', extensions: ['ics'] }],
    })
    if (savedPath) pushToast({ title: 'Timetable exported', description: savedPath })
  }

  // Import a weekly timetable from a .ics — this app's own export, or
  // anyone else's (e.g. a classmate sharing their exported schedule so a
  // whole section doesn't have to build the grid from scratch). Only
  // recurring weekly events are usable; period numbers are inferred from
  // chronological start time per day, and existing cells are never
  // overwritten — see planIcsTimetableImport for the full rationale.
  function handleImportTimetableIcsText(text: string, source: string) {
    const events = parseIcs(text)
    const plan = planIcsTimetableImport({
      events,
      occupiedCells: new Set(slots.map((s) => `${s.day}:${s.period}`)),
      maxPeriod: periodsPerDay,
    })
    if (plan.toCreate.length === 0) {
      pushToast({
        title: 'Nothing to import',
        description:
          plan.skipped > 0
            ? `${plan.skipped} period${plan.skipped === 1 ? '' : 's'} skipped: already filled, or beyond ${periodsPerDay} periods/day.`
            : `Couldn't find a weekly class schedule in ${source}.`,
      })
      return
    }
    setImportPlan(plan)
    setImportSource(source)
    setImportTimetableOpen(true)
  }

  async function handleImportTimetableIcs() {
    const file = await window.bunkmate.files.openTextFile({ filters: [{ name: 'iCalendar', extensions: ['ics'] }] })
    if (!file) return
    handleImportTimetableIcsText(file.content, file.name)
  }

  async function applyImportTimetable() {
    if (!importPlan) return
    setImportingTimetable(true)
    try {
      const subjectIdByName = new Map(
        subjects.filter((s) => s.semester === semester).map((s) => [s.name.toLowerCase(), s.id]),
      )
      for (const name of importPlan.subjectNames) {
        const key = name.toLowerCase()
        if (!subjectIdByName.has(key)) {
          const created = await createSubject({ name, semester, credits: 0, faculty: null, category: null })
          subjectIdByName.set(key, created.id)
        }
      }
      for (const s of importPlan.toCreate) {
        await create({
          semester,
          day: s.day,
          period: s.period,
          subjectId: subjectIdByName.get(s.subjectName.toLowerCase()) ?? null,
          type: 'class',
          startTime: s.startTime,
          endTime: s.endTime,
        })
      }
      pushToast({
        title: `Imported ${importPlan.toCreate.length} period${importPlan.toCreate.length === 1 ? '' : 's'}`,
        description:
          (importPlan.skipped > 0 ? `${importPlan.skipped} skipped (already filled). ` : '') + `From ${importSource}`,
      })
      setImportTimetableOpen(false)
      setImportPlan(null)
    } finally {
      setImportingTimetable(false)
    }
  }

  // --- Drag-to-reschedule ---------------------------------------------
  //
  // Dropping on an EMPTY slot moves the dragged period there. Dropping on
  // an OCCUPIED slot SWAPS the two periods' content — chosen over blocking
  // because the obvious intent of dragging one period onto another is "put
  // these two where the other one was", and forcing a clear-then-place
  // round trip through the dialog for that is exactly the friction
  // drag-and-drop is meant to remove. The actual move/swap decision,
  // validation (teaching-period cap + single-lunch-per-day, via the same
  // validateTimetableDay used everywhere else), and resulting updates are
  // computed by the pure, unit-tested planDragDrop() — see
  // src/lib/timetable-drag.ts for exactly why a swap is safe to apply as
  // two independent updates, and why periodTimes need no special handling
  // here (they're keyed by period number, not by slot).
  const [draggedFrom, setDraggedFrom] = useState<{ day: Weekday; period: number } | null>(null)
  const [dragOverCell, setDragOverCell] = useState<{ day: Weekday; period: number } | null>(null)

  async function handleDrop(targetDay: Weekday, targetPeriod: number) {
    const from = draggedFrom
    setDraggedFrom(null)
    setDragOverCell(null)
    if (!from) return
    if (from.day === targetDay && from.period === targetPeriod) return

    const plan = planDragDrop({
      slots,
      from,
      to: { day: targetDay, period: targetPeriod },
      maxTeachingPeriods: periodsPerDay,
    })
    if (!plan.ok) {
      pushToast({ title: "Can't reschedule there", description: plan.reason })
      return
    }

    for (const u of plan.updates) {
      const { id, ...patch } = u
      await update(id, patch)
    }

    // planDragDrop returns one update for a move (only the dragged row
    // changes) and two for a swap (both rows trade content) — that count
    // is a reliable, self-contained way to tell the toast which happened.
    const isSwap = plan.updates.length === 2
    pushToast({
      title: isSwap ? 'Periods swapped' : 'Period moved',
      description: isSwap
        ? `${DAY_LABELS[from.day]} · P${from.period} ↔ ${DAY_LABELS[targetDay]} · P${targetPeriod}`
        : `${DAY_LABELS[from.day]} · P${from.period} → ${DAY_LABELS[targetDay]} · P${targetPeriod}`,
    })
  }

  const slotAt = useMemo(() => {
    const map = new Map<string, TimetableSlot>()
    for (const slot of slots) map.set(`${slot.day}:${slot.period}`, slot)
    return map
  }, [slots])

  function openCell(day: Weekday, period: number) {
    const existing = slotAt.get(`${day}:${period}`)
    setForm({
      subjectId: existing?.subjectId ? String(existing.subjectId) : 'none',
      type: existing?.type ?? (period === lunchPeriod ? 'lunch' : 'class'),
      startTime: existing?.startTime ?? '',
      endTime: existing?.endTime ?? '',
    })
    setDialogTarget({ day, period })
  }

  /** Week-at-a-glance is read-only — clicking a period there switches back
   * to the editable grid and opens that exact cell, rather than mutating
   * anything itself. */
  function goToGridCell(day: Weekday, period: number) {
    setView('grid')
    openCell(day, period)
  }

  function openGridSettings() {
    setGridForm({ periodsPerDay: String(periodsPerDay), lunchPeriod: String(lunchPeriod), dayStartTime: '', dayEndTime: '' })
    setPendingPeriodTimes(null)
    setGridSettingsOpen(true)
  }

  function handleAutoAllocate() {
    try {
      const times = allocateEvenPeriodTimes({
        periodsPerDay: Math.max(1, Number(gridForm.periodsPerDay) || 1),
        dayStartTime: gridForm.dayStartTime,
        dayEndTime: gridForm.dayEndTime,
      })
      setPendingPeriodTimes(times)
    } catch (err) {
      setPendingPeriodTimes(null)
      const fe = friendlyError(err, "Can't auto-allocate times")
      pushToast({ title: "Can't auto-allocate times", description: fe.message, detail: fe.detail })
    }
  }

  async function handleGridSettingsSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!activeSemester) return
    await updateSemester(activeSemester.id, {
      periodsPerDay: Math.max(1, Number(gridForm.periodsPerDay) || 1),
      lunchPeriod: Math.max(1, Number(gridForm.lunchPeriod) || 1),
      ...(pendingPeriodTimes ? { periodTimes: pendingPeriodTimes } : {}),
    })
    pushToast({ title: 'Grid settings updated' })
    setGridSettingsOpen(false)
    setPendingPeriodTimes(null)
  }

  // When Grid Settings has auto-allocated a time for this period, the
  // per-slot start/end inputs below are redundant — the row already shows
  // the real time for every day at once. Hide them in favor of a plain
  // readout instead of asking for the same time twice.
  const dialogAutoTime = dialogTarget ? periodTimeByPeriod.get(dialogTarget.period) : undefined

  const subjectRequired = !TYPES_WITHOUT_SUBJECT.includes(form.type)
  const subjectMissing = subjectRequired && form.subjectId === 'none'

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!dialogTarget) return
    if (subjectMissing) return
    const { day, period } = dialogTarget
    const existing = slotAt.get(`${day}:${period}`)

    const daySlots = slots
      .filter((s) => s.day === day && s.period !== period)
      .map((s) => ({ period: s.period, type: s.type }))
    daySlots.push({ period, type: form.type })
    const validation = validateTimetableDay(daySlots, { maxTeachingPeriods: periodsPerDay })
    if (!validation.ok) {
      pushToast({ title: "Can't save this slot", description: validation.errors[0] })
      return
    }

    setSaving(true)
    try {
      const payload = {
        semester,
        day,
        period,
        subjectId: form.subjectId === 'none' ? null : Number(form.subjectId),
        type: form.type,
        // The period-level auto-allocated time is the source of truth once
        // it exists — don't also persist a per-slot value that could drift
        // out of sync with it.
        startTime: dialogAutoTime ? null : form.startTime || null,
        endTime: dialogAutoTime ? null : form.endTime || null,
      }
      if (existing) {
        await update(existing.id, payload)
      } else {
        await create(payload)
      }
      pushToast({ title: 'Timetable updated' })
      setDialogTarget(null)
    } finally {
      setSaving(false)
    }
  }

  async function handleClear() {
    if (!dialogTarget) return
    const existing = slotAt.get(`${dialogTarget.day}:${dialogTarget.period}`)
    if (existing) {
      await remove(existing.id)
      pushToast({ title: 'Slot cleared' })
    }
    setDialogTarget(null)
  }

  if (!semester) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Timetable</h1>
        <p className="text-sm text-muted-foreground">
          No semester is set up yet. Create one on the{' '}
          <a href="#/semesters" className="underline">
            Semesters
          </a>{' '}
          page to start building a timetable.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Hero Header & Quick Stats */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Weekly Timetable</h1>
            <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-xs">
              {activeSemester?.label ?? semester}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your weekly class schedule, period time slots, and timetable exports.
          </p>
        </div>

        <div className="no-print flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.print()} title="Print this timetable">
            <Printer className="size-3.5 mr-1.5" /> Print
          </Button>
          <SemesterSwitcher />
          <div className="flex rounded-lg border p-1 bg-muted/30">
            <Button
              variant={view === 'grid' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setView('grid')}
            >
              <Table2 className="size-3.5" /> Grid View
            </Button>
            <Button
              variant={view === 'week' ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setView('week')}
            >
              <CalendarRange className="size-3.5" /> Overview
            </Button>
          </div>
        </div>
      </div>

      {/* Secondary Action Toolbar */}
      {view === 'grid' && (
        <Card className="p-3 bg-card/60">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setCopyFromSemesterLabel('')
                  setCopyFromOpen(true)
                }}
                disabled={!activeSemester || otherSemesters.length === 0}
                title="Copy an entire timetable from another semester into empty cells"
              >
                <Import className="size-3.5 mr-1.5" /> Copy from Semester
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  setCopySourceDay('mon')
                  setCopyTargetDays({})
                  setCopyDayOpen(true)
                }}
                disabled={!activeSemester || slots.length === 0}
              >
                <CopyPlus className="size-3.5 mr-1.5" /> Copy Day
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => {
                  if (!hasPeriodTimes) {
                    pushToast({
                      title: 'Set class times first',
                      description: 'Opening Grid settings — use "Auto-allocate times", then try exporting again.',
                    })
                    openGridSettings()
                    return
                  }
                  exportIcs()
                }}
                disabled={!activeSemester || slots.length === 0}
              >
                <CalendarPlus className="size-3.5 mr-1.5" /> Export .ics
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={handleImportTimetableIcs}
                disabled={!activeSemester}
              >
                <FileUp className="size-3.5 mr-1.5" /> Import .ics
              </Button>
              {activeSemester && <IcsUrlImportButton size="sm" onIcsText={handleImportTimetableIcsText} />}
            </div>

            <Button variant="secondary" size="sm" className="h-8 text-xs" onClick={openGridSettings} disabled={!activeSemester}>
              <Settings2 className="size-3.5 mr-1.5" /> Grid Settings ({periodsPerDay} P/Day)
            </Button>
          </div>
        </Card>
      )}

      {projectSlots.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-center gap-2">
            <TriangleAlert className="size-4 shrink-0 text-amber-500" />
            <span>
              {projectSlots.length === 1
                ? "1 period is still marked as generic \"Project Work\" — assign it to a subject."
                : `${projectSlots.length} periods are still marked as generic "Project Work" — assign them to subjects.`}
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => setReassignOpen(true)}>
            Assign now
          </Button>
        </div>
      )}

      {view === 'week' ? (
        <TimetableWeekGlance
          slots={slots}
          periodsPerDay={periodsPerDay}
          periodTimeByPeriod={periodTimeByPeriod}
          subjects={subjects}
          onCellClick={goToGridCell}
        />
      ) : (
        <Card className="overflow-hidden border">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-xs">
                  <th className="w-24 p-3 text-left font-semibold text-muted-foreground border-r">Time & Period</th>
                  {WEEKDAYS.map((day) => {
                    const daySlots = slots.filter((s) => s.day === day)
                    return (
                      <th key={day} className="p-3 text-left font-semibold text-muted-foreground border-r last:border-r-0 min-w-[140px]">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground text-sm">{DAY_LABELS[day]}</span>
                          <div className="flex items-center gap-1">
                            <Badge variant="secondary" className="font-normal text-[10px] px-1.5">
                              {daySlots.length} class{daySlots.length === 1 ? '' : 'es'}
                            </Badge>
                            {daySlots.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setClearDayTarget(day)}
                                title={`Clear all of ${DAY_LABELS[day]}`}
                                aria-label={`Clear all of ${DAY_LABELS[day]}`}
                                className="text-muted-foreground/60 transition-colors hover:text-destructive p-0.5 rounded"
                              >
                                <Eraser className="size-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody className="divide-y">
                {PERIODS.map((period) => {
                  const time = periodTimeByPeriod.get(period)
                  const isLunchRow = period === lunchPeriod
                  return (
                    <tr key={period} className={cn('transition-colors', isLunchRow ? 'bg-amber-500/5 hover:bg-amber-500/10' : 'hover:bg-muted/10')}>
                      <td className={cn('p-3 font-medium text-xs border-r', isLunchRow ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted/10 text-muted-foreground')}>
                        <div className={cn('font-semibold', isLunchRow ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-foreground')}>
                          {getPeriodDisplayLabel(period, lunchPeriod)}
                        </div>
                        {time ? (
                          <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                            {time.startTime} – {time.endTime}
                          </div>
                        ) : (
                          <div className="text-[10px] text-muted-foreground/60 mt-0.5">Unset time</div>
                        )}
                      </td>
                      {WEEKDAYS.map((day) => {
                        const slot = slotAt.get(`${day}:${period}`)
                        const subjectName = slot?.subjectId ? subjectsById.get(slot.subjectId)?.name : undefined
                        const subjectColor = slot?.subjectId ? colorBySubjectId.get(slot.subjectId) : undefined
                        const isDragSource = draggedFrom?.day === day && draggedFrom.period === period
                        const isDragOver = dragOverCell?.day === day && dragOverCell.period === period
                        return (
                          <td key={day} className="p-1.5 align-top border-r last:border-r-0">
                            <button
                              type="button"
                              onClick={() => openCell(day, period)}
                              draggable={!!slot}
                              onDragStart={(e) => {
                                setDraggedFrom({ day, period })
                                e.dataTransfer.effectAllowed = 'move'
                              }}
                              onDragEnd={() => {
                                setDraggedFrom(null)
                                setDragOverCell(null)
                              }}
                              onDragOver={(e) => {
                                if (!draggedFrom) return
                                e.preventDefault()
                                e.dataTransfer.dropEffect = 'move'
                              }}
                              onDragEnter={() => {
                                if (draggedFrom) setDragOverCell({ day, period })
                              }}
                              onDragLeave={() => {
                                setDragOverCell((prev) => (prev?.day === day && prev.period === period ? null : prev))
                              }}
                              onDrop={(e) => {
                                e.preventDefault()
                                void handleDrop(day, period)
                              }}
                              className={cn(
                                'flex h-20 w-full flex-col items-start justify-between rounded-lg border p-2 text-left transition-all duration-150',
                                slot ? 'border-solid bg-card shadow-xs hover:border-primary/50 cursor-grab active:cursor-grabbing' : 'border-dashed hover:border-muted-foreground/40 hover:bg-accent/40',
                                isLunchRow && !slot && 'bg-amber-500/5 border-amber-500/20 text-amber-600 dark:text-amber-400',
                                isDragSource && 'opacity-30 border-dashed',
                                isDragOver && 'ring-2 ring-primary ring-offset-1 bg-primary/10',
                              )}
                              style={
                                slot && subjectColor
                                  ? { borderLeftWidth: '4px', borderLeftColor: subjectColor }
                                  : undefined
                              }
                            >
                              {slot ? (
                                <>
                                  <div className="flex items-center justify-between w-full">
                                    <Badge
                                      variant={TYPE_VARIANT[slot.type as PeriodType] ?? 'default'}
                                      className="text-[10px] px-1.5 py-0 capitalize"
                                    >
                                      {slot.type}
                                    </Badge>
                                    {slot.startTime && slot.endTime && (
                                      <span className="text-[10px] text-muted-foreground tabular-nums">
                                        {slot.startTime}
                                      </span>
                                    )}
                                  </div>
                                  {subjectName ? (
                                    <div className="w-full mt-1">
                                      <div className="font-medium text-xs truncate leading-snug">{subjectName}</div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground capitalize italic mt-1">{slot.type}</div>
                                  )}
                                </>
                              ) : (
                                <div className="flex items-center justify-center w-full h-full text-muted-foreground/40 text-xs font-medium gap-1">
                                  <span>{isLunchRow ? '🍱 Lunch' : '+ Add'}</span>
                                </div>
                              )}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Dialog open={dialogTarget !== null} onOpenChange={(open) => !open && setDialogTarget(null)}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>
                {dialogTarget && `${DAY_LABELS[dialogTarget.day]} · ${getPeriodDisplayLabel(dialogTarget.period, lunchPeriod)}`}
              </DialogTitle>
              <DialogDescription>Assign a period type and, if applicable, a subject.</DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="slot-type">Period type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PeriodType })}>
                <SelectTrigger id="slot-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SELECTABLE_PERIOD_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="slot-subject">
                Subject{subjectRequired && <span className="text-destructive"> *</span>}
              </Label>
              <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
                <SelectTrigger id="slot-subject">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {!subjectRequired && <SelectItem value="none">None</SelectItem>}
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {subjectMissing && (
                <p className="text-xs text-destructive">
                  A subject is required so attendance can be marked for this period.
                </p>
              )}
            </div>

            {dialogAutoTime ? (
              <p className="text-xs text-muted-foreground">
                Time: {dialogAutoTime.startTime}–{dialogAutoTime.endTime} (auto-allocated; change it from Grid
                settings, not here).
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="slot-start">Start time</Label>
                  <Input
                    id="slot-start"
                    type="time"
                    value={form.startTime}
                    onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="slot-end">End time</Label>
                  <Input
                    id="slot-end"
                    type="time"
                    value={form.endTime}
                    onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                  />
                </div>
              </div>
            )}

            <DialogFooter className="sm:justify-between">
              <Button type="button" variant="ghost" onClick={handleClear}>
                <Trash2 /> Clear slot
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={() => setDialogTarget(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving || subjectMissing}>
                  Save
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={gridSettingsOpen} onOpenChange={setGridSettingsOpen}>
        <DialogContent>
          <form onSubmit={handleGridSettingsSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Grid settings</DialogTitle>
              <DialogDescription>
                Controls the Timetable grid size and lunch position for {semester}. Also editable from the{' '}
                Semesters page.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="grid-periods">Periods per day</Label>
                <Input
                  id="grid-periods"
                  type="number"
                  min={1}
                  value={gridForm.periodsPerDay}
                  onChange={(e) => setGridForm({ ...gridForm, periodsPerDay: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="grid-lunch">Lunch period</Label>
                <Input
                  id="grid-lunch"
                  type="number"
                  min={1}
                  value={gridForm.lunchPeriod}
                  onChange={(e) => setGridForm({ ...gridForm, lunchPeriod: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs text-muted-foreground">
                Auto-allocate times: evenly splits the day across all {gridForm.periodsPerDay || periodsPerDay}{' '}
                periods (lunch included). Re-run this after changing periods/lunch/times above; it won't happen
                automatically.
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="grid-day-start">Day start time</Label>
                  <Input
                    id="grid-day-start"
                    type="time"
                    value={gridForm.dayStartTime}
                    onChange={(e) => setGridForm({ ...gridForm, dayStartTime: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="grid-day-end">Day end time</Label>
                  <Input
                    id="grid-day-end"
                    type="time"
                    value={gridForm.dayEndTime}
                    onChange={(e) => setGridForm({ ...gridForm, dayEndTime: e.target.value })}
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!gridForm.dayStartTime || !gridForm.dayEndTime}
                onClick={handleAutoAllocate}
              >
                Auto-allocate times
              </Button>
              {pendingPeriodTimes && (
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  {pendingPeriodTimes.map((pt) => (
                    <span key={pt.period}>
                      P{pt.period} {pt.startTime}–{pt.endTime}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setGridSettingsOpen(false)}>
                Cancel
              </Button>
              <Button type="submit">Save{pendingPeriodTimes ? ' & apply times' : ''}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={reassignOpen} onOpenChange={setReassignOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign "Project Work" periods to a subject</DialogTitle>
            <DialogDescription>
              These periods were set up before Project Work had its own subject entry. Pick which subject each one
              belongs to below, and it'll start counting toward that subject's attendance instead of a separate,
              unnamed total.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 space-y-2 overflow-y-auto">
            {projectSlots.length === 0 ? (
              <p className="text-sm text-muted-foreground">All periods have been reassigned.</p>
            ) : (
              projectSlots.map((slot) => (
                <div key={slot.id} className="flex items-center gap-2 rounded-md border p-2">
                  <span className="w-28 shrink-0 text-sm font-medium">
                    {DAY_LABELS[slot.day]} · P{slot.period}
                  </span>
                  <Select
                    value={reassignChoice[slot.id] ?? ''}
                    onValueChange={(v) => setReassignChoice((prev) => ({ ...prev, [slot.id]: v }))}
                  >
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder="Choose a subject…" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" disabled={!reassignChoice[slot.id]} onClick={() => reassignSlot(slot)}>
                    Reassign
                  </Button>
                </div>
              ))
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setReassignOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyDayOpen} onOpenChange={setCopyDayOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy day's schedule</DialogTitle>
            <DialogDescription>
              Replaces every period on the day(s) you pick below with an exact copy of the source day:
              same type, same subject. Anything currently on a target day that the source day doesn't
              also have gets cleared.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="copy-source">Copy from</Label>
            <Select value={copySourceDay} onValueChange={(v) => setCopySourceDay(v as Weekday)}>
              <SelectTrigger id="copy-source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAYS.map((day) => {
                  const count = slots.filter((s) => s.day === day).length
                  return (
                    <SelectItem key={day} value={day}>
                      {DAY_LABELS[day]} ({count} period{count === 1 ? '' : 's'})
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Copy to</Label>
            <div className="grid grid-cols-3 gap-2">
              {WEEKDAYS.filter((d) => d !== copySourceDay).map((day) => (
                <label key={day} className="flex items-center gap-2 rounded-md border p-2 text-sm">
                  <Checkbox
                    checked={copyTargetDays[day] ?? false}
                    onCheckedChange={(checked) =>
                      setCopyTargetDays((prev) => ({ ...prev, [day]: checked === true }))
                    }
                  />
                  {DAY_LABELS[day]}
                </label>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCopyDayOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={copying || Object.values(copyTargetDays).every((v) => !v)}
              onClick={copyDay}
            >
              Copy
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={copyFromOpen} onOpenChange={setCopyFromOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copy timetable from another semester</DialogTitle>
            <DialogDescription>
              Fills only the empty cells in {semester}, nothing already set here is touched. Subjects are matched
              by name; any without a match in {semester} are copied as structure for you to reassign.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="copy-from-semester">Source semester</Label>
            <Select value={copyFromSemesterLabel} onValueChange={setCopyFromSemesterLabel}>
              <SelectTrigger id="copy-from-semester">
                <SelectValue placeholder="Choose a semester…" />
              </SelectTrigger>
              <SelectContent>
                {otherSemesters.map((s) => (
                  <SelectItem key={s.id} value={s.label}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCopyFromOpen(false)}>
              Cancel
            </Button>
            <Button disabled={!copyFromSemesterLabel || copyingFrom} onClick={copyFromSemester}>
              Copy into {semester}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={importTimetableOpen} onOpenChange={setImportTimetableOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import timetable from {importSource}</DialogTitle>
            <DialogDescription>
              Fills only the empty cells in {semester}, nothing already set here is touched. Period numbers are
              inferred from each day's class times.
            </DialogDescription>
          </DialogHeader>
          {importPlan && (
            <div className="space-y-2 text-sm">
              <p>
                <span className="font-medium">{importPlan.toCreate.length}</span> period
                {importPlan.toCreate.length === 1 ? '' : 's'} will be added.
              </p>
              {importPlan.skipped > 0 && (
                <p className="text-muted-foreground">
                  {importPlan.skipped} period{importPlan.skipped === 1 ? '' : 's'} skipped: already filled, or
                  beyond {periodsPerDay} periods/day.
                </p>
              )}
              {importPlan.subjectNames.length > 0 && (
                <p className="text-muted-foreground">
                  Subjects: {importPlan.subjectNames.join(', ')}
                  {'. '}
                  New ones are created automatically.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportTimetableOpen(false)}>
              Cancel
            </Button>
            <Button disabled={importingTimetable} onClick={applyImportTimetable}>
              Import into {semester}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearDayTarget !== null} onOpenChange={(open) => !open && setClearDayTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Clear {clearDayTarget && DAY_LABELS[clearDayTarget]}?</DialogTitle>
            <DialogDescription>
              Removes every period on {clearDayTarget && DAY_LABELS[clearDayTarget]} for {semester}. Attendance
              records already logged aren't affected, this only clears the schedule. This can't be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearDayTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={() => clearDayTarget && clearDay(clearDayTarget)}>
              Clear day
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
