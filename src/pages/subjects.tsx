import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Archive, ArchiveRestore, Trash2, History, X, Link as LinkIcon, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
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
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useToastStore } from '@/store/toast-store'
import { useHotkey } from '@/hooks/use-hotkey'
import { SUBJECT_COLOR_SWATCHES } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'
import type { Subject, NewSubject } from '../../electron/db/repositories/subjects'
import type { AttendanceRecord } from '../../electron/db/repositories/attendance-records'

const CATEGORIES = ['core', 'elective', 'lab', 'other']

interface SubjectFormState {
  name: string
  semester: string
  credits: string
  faculty: string
  facultyEmail: string
  officeHours: string
  category: string
  /** Blank means "inherit the default subject minimum" (customMinTarget: null). */
  customMinTarget: string
  /** Empty means "use the palette slot" (color: null). */
  color: string
  notes: string
  link: string
}

function emptyForm(defaultSemester: string): SubjectFormState {
  return {
    name: '',
    semester: defaultSemester,
    credits: '3',
    faculty: '',
    facultyEmail: '',
    officeHours: '',
    category: 'core',
    customMinTarget: '',
    color: '',
    notes: '',
    link: '',
  }
}

export function SubjectsPage() {
  const { subjects, loading, load, create, update, setArchived, remove } = useSubjectsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const subjectMinTarget = useSettingsStore((s) => s.subjectMinTarget)
  const { semesters: allSemesters, load: loadSemesters } = useSemestersStore()
  const pushToast = useToastStore((s) => s.push)

  const [showArchived, setShowArchived] = useState(false)
  const [semesterFilter, setSemesterFilter] = useState<string>('all')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Subject | null>(null)
  const [form, setForm] = useState<SubjectFormState>(emptyForm(currentSemester))
  const [deleteTarget, setDeleteTarget] = useState<Subject | null>(null)
  const [saving, setSaving] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [historySubject, setHistorySubject] = useState<Subject | null>(null)
  const [historyRecords, setHistoryRecords] = useState<AttendanceRecord[] | null>(null)

  useEffect(() => {
    load({ includeArchived: true })
    loadSemesters()
  }, [load, loadSemesters])

  const semesters = useMemo(
    () => [...allSemesters].filter((s) => !s.archived).sort((a, b) => a.number - b.number),
    [allSemesters],
  )

  const visibleSubjects = useMemo(() => {
    return subjects.filter((s) => {
      if (!showArchived && s.archived) return false
      if (semesterFilter !== 'all' && s.semester !== semesterFilter) return false
      return true
    })
  }, [subjects, showArchived, semesterFilter])

  function openCreateDialog() {
    setEditing(null)
    setForm(emptyForm(currentSemester))
    setDialogOpen(true)
  }

  useHotkey('n', openCreateDialog)

  function openEditDialog(subject: Subject) {
    setEditing(subject)
    setForm({
      name: subject.name,
      semester: subject.semester,
      credits: String(subject.credits),
      faculty: subject.faculty ?? '',
      facultyEmail: subject.facultyEmail ?? '',
      officeHours: subject.officeHours ?? '',
      category: subject.category ?? 'core',
      customMinTarget: subject.customMinTarget === null ? '' : String(subject.customMinTarget),
      color: subject.color ?? '',
      notes: subject.notes ?? '',
      link: subject.link ?? '',
    })
    setDialogOpen(true)
  }

  async function openHistory(subject: Subject) {
    setHistorySubject(subject)
    setHistoryRecords(null)
    const records = await window.bunkmate.attendanceRecords.list({ subjectId: subject.id })
    setHistoryRecords(records)
  }

  // Selection is scoped to what's currently visible — a filter change that
  // hides a selected row shouldn't leave it acted on by a bulk button.
  const visibleIds = useMemo(() => visibleSubjects.map((s) => s.id), [visibleSubjects])
  const selectedVisible = useMemo(
    () => visibleSubjects.filter((s) => selectedIds.has(s.id)),
    [visibleSubjects, selectedIds],
  )
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id))
      else visibleIds.forEach((id) => next.add(id))
      return next
    })
  }

  function toggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function bulkArchive(archived: boolean) {
    const targets = selectedVisible.filter((s) => s.archived !== archived)
    for (const s of targets) await setArchived(s.id, archived)
    setSelectedIds(new Set())
    pushToast({
      title: `${archived ? 'Archived' : 'Restored'} ${targets.length} subject${targets.length === 1 ? '' : 's'}`,
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.semester.trim()) return

    setSaving(true)
    try {
      const payload: NewSubject = {
        name: form.name.trim(),
        semester: form.semester.trim(),
        credits: Math.max(0, Number(form.credits) || 0),
        faculty: form.faculty.trim() || null,
        facultyEmail: form.facultyEmail.trim() || null,
        officeHours: form.officeHours.trim() || null,
        category: form.category || null,
        customMinTarget:
          form.customMinTarget.trim() === '' ? null : Math.min(100, Math.max(0, Number(form.customMinTarget))),
        color: form.color || null,
        notes: form.notes.trim() || null,
        link: form.link.trim() || null,
      }
      if (editing) {
        await update(editing.id, payload)
        pushToast({ title: 'Subject updated' })
      } else {
        await create(payload)
        pushToast({ title: 'Subject created' })
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleArchive(subject: Subject) {
    await setArchived(subject.id, !subject.archived)
    pushToast({ title: subject.archived ? 'Subject restored' : 'Subject archived' })
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await remove(target.id)
    setDeleteTarget(null)
    pushToast({
      title: 'Subject deleted',
      description: `${target.name} and its attendance history were removed.`,
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Subjects</h1>
        <Button onClick={openCreateDialog}>
          <Plus /> New Subject
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="semester-filter">Semester</Label>
          <Select value={semesterFilter} onValueChange={setSemesterFilter}>
            <SelectTrigger id="semester-filter" className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All semesters</SelectItem>
              {semesters.map((sem) => (
                <SelectItem key={sem.id} value={sem.label}>
                  {sem.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Switch id="show-archived" checked={showArchived} onCheckedChange={setShowArchived} />
          <Label htmlFor="show-archived">Show archived</Label>
        </div>
      </div>

      {selectedVisible.length > 0 && (
        <div className="flex items-center gap-3 rounded-md border bg-accent/40 px-3 py-2 text-sm">
          <span className="font-medium">{selectedVisible.length} selected</span>
          <Button size="sm" variant="outline" onClick={() => bulkArchive(true)}>
            <Archive /> Archive
          </Button>
          <Button size="sm" variant="outline" onClick={() => bulkArchive(false)}>
            <ArchiveRestore /> Restore
          </Button>
          <Button size="sm" variant="ghost" className="ml-auto" onClick={() => setSelectedIds(new Set())}>
            Clear
          </Button>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={toggleSelectAll}
                    aria-label="Select all"
                    disabled={visibleIds.length === 0}
                  />
                </TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Semester</TableHead>
                <TableHead>Credits</TableHead>
                <TableHead>Faculty</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {visibleSubjects.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No subjects yet.
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                visibleSubjects.map((subject) => (
                <TableRow key={subject.id} data-state={selectedIds.has(subject.id) ? 'selected' : undefined}>
                  <TableCell>
                    <Checkbox
                      checked={selectedIds.has(subject.id)}
                      onCheckedChange={() => toggleSelect(subject.id)}
                      aria-label={`Select ${subject.name}`}
                    />
                  </TableCell>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-full border"
                        style={{ backgroundColor: subject.color ?? 'var(--muted)' }}
                      />
                      {subject.name}
                      {subject.link && (
                        <a
                          href={subject.link}
                          target="_blank"
                          rel="noreferrer"
                          title={subject.link}
                          aria-label={`Open link for ${subject.name}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          <LinkIcon className="size-3.5" />
                        </a>
                      )}
                      {subject.notes && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <StickyNote className="size-3.5 shrink-0 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>{subject.notes}</TooltipContent>
                        </Tooltip>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{subject.semester}</TableCell>
                  <TableCell>{subject.credits}</TableCell>
                  <TableCell>
                    {subject.faculty ? (
                      subject.facultyEmail || subject.officeHours ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button type="button" className="underline decoration-dotted underline-offset-2">
                              {subject.faculty}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {subject.facultyEmail && <div>{subject.facultyEmail}</div>}
                            {subject.officeHours && <div>{subject.officeHours}</div>}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        subject.faculty
                      )
                    ) : (
                      '—'
                    )}
                  </TableCell>
                  <TableCell>{subject.category ?? '—'}</TableCell>
                  <TableCell>
                    {subject.archived ? (
                      <Badge variant="secondary">Archived</Badge>
                    ) : (
                      <Badge variant="success">Active</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openHistory(subject)}
                        aria-label="Attendance history"
                        title="Attendance history"
                      >
                        <History />
                      </Button>
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(subject)} aria-label="Edit">
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => handleToggleArchive(subject)}
                        aria-label={subject.archived ? 'Restore' : 'Archive'}
                      >
                        {subject.archived ? <ArchiveRestore /> : <Archive />}
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(subject)}
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
              <DialogTitle>{editing ? 'Edit subject' : 'New subject'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Update the subject details.' : 'Add a subject to track attendance for.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="semester">Semester</Label>
                <Select value={form.semester} onValueChange={(v) => setForm({ ...form, semester: v })}>
                  <SelectTrigger id="semester">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {semesters.map((sem) => (
                      <SelectItem key={sem.id} value={sem.label}>
                        {sem.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {semesters.length === 0 && (
                  <p className="text-xs text-destructive">
                    No semesters exist yet. Create one on the Semesters page first.
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="credits">Credits</Label>
                <Input
                  id="credits"
                  type="number"
                  min={0}
                  value={form.credits}
                  onChange={(e) => setForm({ ...form, credits: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="faculty">Faculty</Label>
                <Input
                  id="faculty"
                  value={form.faculty}
                  onChange={(e) => setForm({ ...form, faculty: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="category">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="faculty-email">Faculty email (optional)</Label>
                <Input
                  id="faculty-email"
                  type="email"
                  value={form.facultyEmail}
                  onChange={(e) => setForm({ ...form, facultyEmail: e.target.value })}
                  placeholder="name@christuniversity.in"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="office-hours">Office hours (optional)</Label>
                <Input
                  id="office-hours"
                  value={form.officeHours}
                  onChange={(e) => setForm({ ...form, officeHours: e.target.value })}
                  placeholder="Mon/Wed 2-3pm, Cabin 214"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="custom-min-target">Override minimum % (optional)</Label>
              <Input
                id="custom-min-target"
                type="number"
                min={0}
                max={100}
                value={form.customMinTarget}
                onChange={(e) => setForm({ ...form, customMinTarget: e.target.value })}
                placeholder={`Default: ${subjectMinTarget}%`}
              />
            </div>
            <div className="space-y-2">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  title="Default (palette)"
                  aria-label="Default color"
                  onClick={() => setForm({ ...form, color: '' })}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full border text-muted-foreground',
                    form.color === '' && 'ring-2 ring-ring ring-offset-1',
                  )}
                >
                  <X className="size-3" />
                </button>
                {SUBJECT_COLOR_SWATCHES.map((swatch) => (
                  <button
                    key={swatch}
                    type="button"
                    aria-label={`Color ${swatch}`}
                    onClick={() => setForm({ ...form, color: swatch })}
                    style={{ backgroundColor: swatch }}
                    className={cn(
                      'size-6 rounded-full border',
                      form.color === swatch && 'ring-2 ring-ring ring-offset-1',
                    )}
                  />
                ))}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject-link">Link (optional)</Label>
              <Input
                id="subject-link"
                type="url"
                value={form.link}
                onChange={(e) => setForm({ ...form, link: e.target.value })}
                placeholder="Syllabus, drive folder, course page…"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subject-notes">Notes (optional)</Label>
              <Input
                id="subject-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Anything worth remembering about this subject"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Create subject'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>
              This permanently deletes the subject and its timetable slots and attendance records. This
              cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historySubject !== null} onOpenChange={(open) => !open && setHistorySubject(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{historySubject?.name}: attendance history</DialogTitle>
            <DialogDescription>
              {historyRecords === null
                ? 'Loading…'
                : historyRecords.length === 0
                  ? 'No attendance recorded for this subject yet.'
                  : `${historyRecords.filter((r) => r.status === 'present').length} present · ${historyRecords.filter((r) => r.status === 'absent').length} absent · ${historyRecords.length} total`}
            </DialogDescription>
          </DialogHeader>
          {historyRecords !== null && historyRecords.length > 0 && (
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {[...historyRecords]
                .sort((a, b) => (a.date === b.date ? b.period - a.period : a.date < b.date ? 1 : -1))
                .map((r) => (
                  <div key={r.id} className="flex items-center justify-between rounded-md border px-3 py-1.5 text-sm">
                    <span className="tabular-nums text-muted-foreground">
                      {r.date} · P{r.period}
                    </span>
                    <Badge variant={r.status === 'present' ? 'success' : 'destructive'} className="capitalize">
                      {r.status}
                    </Badge>
                  </div>
                ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistorySubject(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
