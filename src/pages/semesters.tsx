import { useEffect, useState } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
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
import { useSemestersStore } from '@/store/semesters-store'
import { useToastStore } from '@/store/toast-store'
import type {
  Semester,
  NewSemester,
  SemesterDependents,
  RolloverPreview,
} from '../../electron/db/repositories/semesters'

interface SemesterFormState {
  number: string
  label: string
  startDate: string
  endDate: string
  periodsPerDay: string
  lunchPeriod: string
  isActive: boolean
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10)
}

function emptyForm(nextNumber: number): SemesterFormState {
  return {
    number: String(nextNumber),
    label: '',
    startDate: todayIso(),
    endDate: todayIso(),
    periodsPerDay: '7',
    lunchPeriod: '4',
    isActive: false,
  }
}

export function SemestersPage() {
  const { semesters, loading, load, create, createWithRollover, update, setArchived, remove } = useSemestersStore()
  const pushToast = useToastStore((s) => s.push)

  const [showArchived, setShowArchived] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Semester | null>(null)
  const [form, setForm] = useState<SemesterFormState>(emptyForm(1))
  const [saving, setSaving] = useState(false)
  const [rolloverFrom, setRolloverFrom] = useState('')
  const [rolloverPreview, setRolloverPreview] = useState<RolloverPreview | null>(null)

  const [deleteTarget, setDeleteTarget] = useState<Semester | null>(null)
  const [dependents, setDependents] = useState<SemesterDependents | null>(null)
  const [checkingDependents, setCheckingDependents] = useState(false)

  useEffect(() => {
    load()
  }, [load])

  const visibleSemesters = [...semesters]
    .filter((s) => showArchived || !s.archived)
    .sort((a, b) => a.number - b.number)

  function openCreateDialog() {
    setEditing(null)
    const nextNumber = semesters.length > 0 ? Math.max(...semesters.map((s) => s.number)) + 1 : 1
    setForm(emptyForm(nextNumber))
    setRolloverFrom('')
    setRolloverPreview(null)
    setDialogOpen(true)
  }

  // Fetch what a rollover from the chosen source would create, for the
  // preview shown before the user confirms.
  useEffect(() => {
    if (!rolloverFrom) {
      setRolloverPreview(null)
      return
    }
    let cancelled = false
    window.bunkmate.semesters.rolloverPreview(rolloverFrom).then((p) => {
      if (!cancelled) setRolloverPreview(p)
    })
    return () => {
      cancelled = true
    }
  }, [rolloverFrom])

  function openEditDialog(semester: Semester) {
    setEditing(semester)
    setForm({
      number: String(semester.number),
      label: semester.label,
      startDate: semester.startDate,
      endDate: semester.endDate,
      periodsPerDay: String(semester.periodsPerDay),
      lunchPeriod: String(semester.lunchPeriod),
      isActive: semester.isActive,
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.label.trim()) return

    setSaving(true)
    try {
      const payload: NewSemester = {
        number: Math.max(1, Number(form.number) || 1),
        label: form.label.trim(),
        startDate: form.startDate,
        endDate: form.endDate,
        periodsPerDay: Math.max(1, Number(form.periodsPerDay) || 1),
        lunchPeriod: Math.max(1, Number(form.lunchPeriod) || 1),
        isActive: form.isActive,
      }
      if (editing) {
        await update(editing.id, payload)
        pushToast({ title: 'Semester updated' })
      } else if (rolloverFrom) {
        await createWithRollover(payload, rolloverFrom)
        pushToast({
          title: 'Semester created',
          description: `Copied ${rolloverPreview?.subjects.length ?? 0} subject(s) and ${rolloverPreview?.slotCount ?? 0} timetable slot(s) from ${rolloverFrom}.`,
        })
      } else {
        await create(payload)
        pushToast({ title: 'Semester created' })
      }
      setDialogOpen(false)
    } catch (error) {
      pushToast({
        title: 'Could not save semester',
        description: error instanceof Error ? error.message : String(error),
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleSetActive(semester: Semester) {
    await update(semester.id, { isActive: true })
    pushToast({ title: `${semester.label} is now the active semester` })
  }

  async function handleToggleArchive(semester: Semester) {
    await setArchived(semester.id, !semester.archived)
    pushToast({ title: semester.archived ? 'Semester restored' : 'Semester archived' })
  }

  async function openDeleteDialog(semester: Semester) {
    setDeleteTarget(semester)
    setDependents(null)
    setCheckingDependents(true)
    try {
      const result = await window.bunkmate.semesters.getDependents(semester.label)
      setDependents(result)
    } finally {
      setCheckingDependents(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    try {
      await remove(target.id)
      setDeleteTarget(null)
      pushToast({ title: 'Semester deleted', description: target.label })
    } catch (error) {
      pushToast({
        title: 'Could not delete semester',
        description: error instanceof Error ? error.message : String(error),
      })
    }
  }

  const blockDelete = dependents !== null && (dependents.subjects > 0 || dependents.timetableSlots > 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Semesters</h1>
        <Button onClick={openCreateDialog}>
          <Plus /> New Semester
        </Button>
      </div>

      <div className="flex items-center gap-2">
        <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
        <Label htmlFor="show-archived">Show archived</Label>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Label</TableHead>
                <TableHead>#</TableHead>
                <TableHead>Dates</TableHead>
                <TableHead>Periods/day</TableHead>
                <TableHead>Lunch period</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {visibleSemesters.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">
                    No semesters yet.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                visibleSemesters.map((semester) => (
                  <TableRow key={semester.id}>
                    <TableCell className="font-medium">{semester.label}</TableCell>
                    <TableCell>{semester.number}</TableCell>
                    <TableCell>
                      {semester.startDate} – {semester.endDate}
                    </TableCell>
                    <TableCell>{semester.periodsPerDay}</TableCell>
                    <TableCell>{semester.lunchPeriod}</TableCell>
                    <TableCell>
                      {semester.archived ? (
                        <Badge variant="secondary">Archived</Badge>
                      ) : semester.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="outline">Inactive</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {!semester.archived && !semester.isActive && (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleSetActive(semester)}
                            aria-label="Set active"
                            title="Set as active semester"
                          >
                            <CheckCircle2 />
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openEditDialog(semester)}
                          aria-label="Edit"
                        >
                          <Pencil />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleToggleArchive(semester)}
                          aria-label={semester.archived ? 'Restore' : 'Archive'}
                        >
                          {semester.archived ? <ArchiveRestore /> : <Archive />}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openDeleteDialog(semester)}
                          aria-label="Delete"
                        >
                          <Trash2 />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit semester' : 'New semester'}</DialogTitle>
              <DialogDescription>
                {editing
                  ? 'Update the semester details.'
                  : 'Add a semester to organize subjects and timetable slots under.'}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="label">Label</Label>
                <Input
                  id="label"
                  value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="2026-1"
                  required
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="number">Number</Label>
                <Input
                  id="number"
                  type="number"
                  min={1}
                  value={form.number}
                  onChange={(e) => setForm({ ...form, number: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="start-date">Start date</Label>
                <Input
                  id="start-date"
                  type="date"
                  value={form.startDate}
                  onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="end-date">End date</Label>
                <Input
                  id="end-date"
                  type="date"
                  value={form.endDate}
                  onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="periods-per-day">Periods per day</Label>
                <Input
                  id="periods-per-day"
                  type="number"
                  min={1}
                  value={form.periodsPerDay}
                  onChange={(e) => setForm({ ...form, periodsPerDay: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Total grid rows on the Timetable page, lunch included.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="lunch-period">Lunch period</Label>
                <Input
                  id="lunch-period"
                  type="number"
                  min={1}
                  value={form.lunchPeriod}
                  onChange={(e) => setForm({ ...form, lunchPeriod: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">Defaults new slots at this period to type "lunch".</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="is-active"
                checked={form.isActive}
                onCheckedChange={(checked) => setForm({ ...form, isActive: checked })}
              />
              <Label htmlFor="is-active">Set as active semester</Label>
            </div>

            {!editing && semesters.length > 0 && (
              <div className="space-y-2 rounded-md border p-3">
                <Label htmlFor="rollover-from">Copy structure from (optional)</Label>
                <Select value={rolloverFrom || 'none'} onValueChange={(v) => setRolloverFrom(v === 'none' ? '' : v)}>
                  <SelectTrigger id="rollover-from">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Start empty</SelectItem>
                    {semesters
                      .slice()
                      .sort((a, b) => b.number - a.number)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.label}>
                          {s.label}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {rolloverPreview && (
                  <div className="text-xs text-muted-foreground">
                    <p>
                      Copies <b>{rolloverPreview.subjects.length}</b> subject(s) as fresh rows and{' '}
                      <b>{rolloverPreview.slotCount}</b> timetable slot(s). Attendance, holidays, yellow forms, and
                      exams are <b>not</b> copied. This semester starts with a clean slate.
                    </p>
                    {rolloverPreview.subjects.length > 0 && (
                      <p className="mt-1 truncate">{rolloverPreview.subjects.map((s) => s.name).join(', ')}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Create semester'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.label}?</DialogTitle>
            <DialogDescription>
              {checkingDependents
                ? 'Checking for subjects and timetable slots that reference this semester…'
                : blockDelete
                  ? `This semester can't be deleted: ${dependents?.subjects ?? 0} subject(s) and ${dependents?.timetableSlots ?? 0} timetable slot(s) still reference it. Reassign or delete those first.`
                  : 'This permanently deletes the semester. This cannot be undone.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmDelete}
              disabled={checkingDependents || blockDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
