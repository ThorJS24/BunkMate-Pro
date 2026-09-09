import { Fragment, useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Card, CardContent } from '@/components/ui/card'
import { CollapsibleSection } from '@/components/collapsible-section'
import { useSubjectsStore } from '@/store/subjects-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { useToastStore } from '@/store/toast-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { usePeriodTypeRulesStore } from '@/store/period-type-rules-store'
import { useSettingsStore } from '@/store/settings-store'
import { YellowFormDisputeBadge } from '@/components/yellow-form-dispute'
import type { YellowForm } from '../../electron/db/repositories/yellow-forms'
import { todayIso, groupByMonth } from '@/lib/date-utils'
import { computeAttendance, aggregateOverall, jsDayToWeekday } from '@/lib/attendance-engine'
import { cn } from '@/lib/utils'

// Per CHRIST's handbook (End Semester Exam eligibility section): approved
// leave applications only count toward the 85% aggregate ESE requirement
// when *real* (unadjusted) aggregate attendance already exceeds 75% on the
// last instruction day. Below that floor, a yellow form can't fix ESE
// eligibility by itself — the underlying shortage has to be addressed by
// actually attending more classes.
const ESE_LEAVE_ELIGIBILITY_FLOOR = 75

interface FormState {
  subjectId: string
  date: string
  period: string
  reason: string
}

function emptyForm(defaultSubjectId: string): FormState {
  return { subjectId: defaultSubjectId, date: todayIso(), period: '', reason: '' }
}

const STATUS_VARIANT = {
  pending: 'warning',
  approved: 'success',
  rejected: 'destructive',
} as const

function formatDateLabel(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

export function YellowFormsTab() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { forms, load, create, update, setStatus, remove } = useYellowFormsStore()
  const pushToast = useToastStore((s) => s.push)
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const { records, load: loadRecords } = useAttendanceStore()
  const { slots, load: loadSlots } = useTimetableStore()
  const { holidays, load: loadHolidays } = useHolidaysStore()
  const { rules, load: loadRules } = usePeriodTypeRulesStore()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<YellowForm | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(''))
  const [deleteTarget, setDeleteTarget] = useState<YellowForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    load()
    loadRecords()
    loadHolidays()
    loadRules()
  }, [loadSubjects, load, loadRecords, loadHolidays, loadRules])

  useEffect(() => {
    if (currentSemester) loadSlots(currentSemester)
  }, [loadSlots, currentSemester])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // "Real" attendance ignoring any yellow-form adjustment — computeAttendance
  // treats an approved form as attended, so feeding it an empty yellowForms
  // list is what recovers the unadjusted number. Scoped to the current
  // semester's subjects, matching how the rest of the app scopes attendance.
  const realAggregatePercentage = useMemo(() => {
    if (!currentSemester) return null
    const semesterSubjectIds = new Set(subjects.filter((s) => s.semester === currentSemester).map((s) => s.id))
    const semesterRecords = records.filter((r) => semesterSubjectIds.has(r.subjectId))
    const bySubject = computeAttendance({ records: semesterRecords, slots, holidays, yellowForms: [], rules })
    return aggregateOverall(bySubject).percentage
  }, [currentSemester, subjects, records, slots, holidays, rules])

  // Grouped by month (collapsed except the latest — this list grows for as
  // long as the app is used, same reasoning as the Attendance page), then by
  // date within a month (newest first) so a whole day's forms can be
  // cross-verified against the portal at a glance; within a day, by period.
  const monthGroups = useMemo(() => groupByMonth(forms, (f) => f.date), [forms])
  function dateGroupsFor(items: YellowForm[]) {
    const byDate = new Map<string, YellowForm[]>()
    for (const f of items) {
      const list = byDate.get(f.date)
      if (list) list.push(f)
      else byDate.set(f.date, [f])
    }
    return [...byDate.entries()]
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([date, list]) => ({
        date,
        forms: [...list].sort((a, b) => (a.period ?? 0) - (b.period ?? 0)),
      }))
  }

  function openCreate() {
    setEditing(null)
    setForm(emptyForm(subjects[0] ? String(subjects[0].id) : ''))
    setDialogOpen(true)
  }

  function openEdit(f: YellowForm) {
    setEditing(f)
    setForm({ subjectId: String(f.subjectId), date: f.date, period: f.period ? String(f.period) : '', reason: f.reason ?? '' })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subjectId) return
    setSaving(true)
    try {
      const payload = {
        subjectId: Number(form.subjectId),
        date: form.date,
        period: form.period ? Number(form.period) : null,
        reason: form.reason.trim() || null,
      }
      if (editing) {
        await update(editing.id, payload)
        pushToast({ title: 'Yellow form updated' })
      } else {
        await create(payload)
        pushToast({ title: 'Yellow form submitted' })
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await remove(target.id)
    setDeleteTarget(null)
    const { id: _id, createdAt: _createdAt, status: _status, disputeStatus: _disputeStatus, ...rest } = target
    pushToast({ title: 'Yellow form deleted', action: { label: 'Undo', onClick: () => create(rest) } }, 8000)
  }

  async function handleBatchStatus(formsInGroup: YellowForm[], targetStatus: 'approved' | 'rejected') {
    const pendingForms = formsInGroup.filter((f) => f.status === 'pending')
    if (pendingForms.length === 0) return
    for (const f of pendingForms) {
      await setStatus(f.id, targetStatus)
    }
    pushToast({
      title: `${targetStatus === 'approved' ? 'Approved' : 'Rejected'} ${pendingForms.length} yellow form${pendingForms.length === 1 ? '' : 's'} for this date`,
    })
  }

  function getPeriodCoverage(date: string, formsInGroup: YellowForm[]) {
    const weekday = jsDayToWeekday(date)
    if (!weekday) return null
    const isHoliday = holidays.some((h) => h.date === date && h.type !== 'working_saturday')
    if (isHoliday) return null
    const daySlots = slots.filter((s) => s.day === weekday && s.type !== 'lunch')
    const totalPeriods = daySlots.length
    if (totalPeriods === 0) return null

    const coveredPeriods = new Set(
      formsInGroup
        .map((f) => f.period)
        .filter((p): p is number => p !== null && p !== undefined),
    ).size

    const hasWholeDayForm = formsInGroup.some((f) => f.period === null || f.period === undefined)
    const effectiveCovered = hasWholeDayForm ? totalPeriods : Math.min(coveredPeriods, totalPeriods)

    return {
      coveredPeriods: effectiveCovered,
      totalPeriods,
      isFullDay: effectiveCovered >= totalPeriods,
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Approved forms auto-adjust the effective attended count wherever attendance is computed.
        </p>
        <Button onClick={openCreate} disabled={subjects.length === 0}>
          <Plus /> New form
        </Button>
      </div>

      {realAggregatePercentage !== null && (
        <div
          className={cn(
            'rounded-md border p-3 text-sm',
            realAggregatePercentage >= ESE_LEAVE_ELIGIBILITY_FLOOR
              ? 'border-success/50 bg-success/10'
              : 'border-destructive/50 bg-destructive/10',
          )}
        >
          Your real aggregate attendance, before any yellow form adjustment, is{' '}
          <span className="font-medium">{realAggregatePercentage.toFixed(1)}%</span>.{' '}
          {realAggregatePercentage >= ESE_LEAVE_ELIGIBILITY_FLOOR
            ? `That's above the ${ESE_LEAVE_ELIGIBILITY_FLOOR}% floor, so approved leave can still count toward the 85% End Semester Exam requirement.`
            : `That's below the ${ESE_LEAVE_ELIGIBILITY_FLOOR}% floor — per the handbook, leave applications only count toward the 85% End Semester Exam requirement above this floor, so approving forms alone won't fix eligibility here. Attending more classes will.`}
        </div>
      )}

      {monthGroups.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">No yellow forms on record.</CardContent>
        </Card>
      )}
      {monthGroups.map((month, i) => (
        <CollapsibleSection
          key={month.monthKey}
          title={month.monthLabel}
          summary={`${month.items.length} form${month.items.length === 1 ? '' : 's'}`}
          defaultOpen={i === 0}
        >
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Dispute</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {dateGroupsFor(month.items).map((group) => {
                const coverage = getPeriodCoverage(group.date, group.forms)
                const pendingCount = group.forms.filter((f) => f.status === 'pending').length

                return (
                  <Fragment key={group.date}>
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={6} className="py-2.5 font-medium">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold">{formatDateLabel(group.date)}</span>
                            <Badge variant="secondary" className="font-normal">
                              {group.forms.length} form{group.forms.length === 1 ? '' : 's'}
                            </Badge>
                            {coverage && (
                              <Badge
                                variant={coverage.isFullDay ? 'success' : 'outline'}
                                className={cn('font-medium', coverage.isFullDay ? 'bg-success/15 text-success border-success/30' : '')}
                                title={`${coverage.coveredPeriods} out of ${coverage.totalPeriods} scheduled class periods covered by Yellow Forms on this date`}
                              >
                                {coverage.isFullDay ? 'Full Day' : 'Partial Day'} ({coverage.coveredPeriods}/{coverage.totalPeriods} periods)
                              </Badge>
                            )}
                          </div>

                          {pendingCount > 0 && (
                            <div className="flex items-center gap-1.5 text-xs font-normal">
                              <span className="text-muted-foreground mr-0.5">Day Batch:</span>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-success/40 bg-success/10 text-success hover:bg-success/20 hover:text-success text-xs font-medium px-2.5"
                                onClick={() => handleBatchStatus(group.forms, 'approved')}
                                title={`Approve all ${pendingCount} pending forms for ${formatDateLabel(group.date)}`}
                              >
                                <Check className="mr-1 size-3.5" /> Approve day ({pendingCount})
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive text-xs font-medium px-2.5"
                                onClick={() => handleBatchStatus(group.forms, 'rejected')}
                                title={`Reject all ${pendingCount} pending forms for ${formatDateLabel(group.date)}`}
                              >
                                <X className="mr-1 size-3.5" /> Reject day ({pendingCount})
                              </Button>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  {group.forms.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell>{subjectsById.get(f.subjectId)?.name ?? `#${f.subjectId}`}</TableCell>
                      <TableCell>{f.period ?? 'whole day'}</TableCell>
                      <TableCell className="text-muted-foreground">{f.reason ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANT[f.status]}>{f.status}</Badge>
                      </TableCell>
                      <TableCell>
                        {f.disputeStatus === 'none' && f.status === 'pending' ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <YellowFormDisputeBadge
                            form={f}
                            subjectName={subjectsById.get(f.subjectId)?.name ?? `#${f.subjectId}`}
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {f.status === 'pending' && (
                            <>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setStatus(f.id, 'approved')}
                                aria-label="Approve"
                              >
                                <Check className="text-success" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setStatus(f.id, 'rejected')}
                                aria-label="Reject"
                              >
                                <X className="text-destructive" />
                              </Button>
                            </>
                          )}
                          <Button size="icon" variant="ghost" onClick={() => openEdit(f)} aria-label="Edit">
                            <Pencil />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(f)} aria-label="Delete">
                            <Trash2 />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              )
            })}
          </TableBody>
          </Table>
        </CollapsibleSection>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit yellow form' : 'New yellow form'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update the details below.'
                  : 'Submitted as pending; approve or reject it from the list.'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="yf-subject">Subject</Label>
              <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
                <SelectTrigger id="yf-subject">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="yf-date">Date</Label>
                <Input
                  id="yf-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="yf-period">Period (blank = whole day)</Label>
                <Input
                  id="yf-period"
                  type="number"
                  min={1}
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="yf-reason">Reason</Label>
              <Input
                id="yf-reason"
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder="Medical"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Submit'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this yellow form?</DialogTitle>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
