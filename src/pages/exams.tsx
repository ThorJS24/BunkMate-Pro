import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, FileUp, X, ChevronDown, ChevronRight, CalendarPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Progress } from '@/components/ui/progress'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { useExamsStore } from '@/store/exams-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'
import { countdownLabel, daysUntil, todayIso } from '@/lib/date-utils'
import { parseHallTicket } from '@/lib/hall-ticket-parser'
import { groupExams } from '@/lib/exam-grouping'
import { buildExamsIcs } from '@/lib/exam-ics'
import { parseIcs } from '@/lib/ics-parser'
import { icsEventsToExamDrafts } from '@/lib/exams-ics-import'
import type { Exam } from '../../electron/db/repositories/exams'
import type { PdfOcrProgress } from '../../electron/ipc/contract'

const NO_SUBJECT = 'none'
// The CHRIST sitting structure: three CIAs of two components each, the two
// semester exams, and their optional lab papers. Free text still wins — these
// are only suggestions in the dropdown, so anything else can be typed.
const GROUP_SUGGESTIONS = [
  'CIA I - Component 1',
  'CIA I - Component 2',
  'CIA II - Component 1',
  'CIA II - Component 2',
  'CIA III - Component 1',
  'CIA III - Component 2',
  'Mid Semester',
  'Mid Semester - Lab',
  'End Semester',
  'End Semester - Lab',
]

interface ExamFormState {
  name: string
  subjectId: string
  date: string
  startTime: string
  reportingTime: string
  courseCode: string
  location: string
  examGroup: string
  notes: string
}

function emptyForm(): ExamFormState {
  return {
    name: '',
    subjectId: NO_SUBJECT,
    date: todayIso(),
    startTime: '',
    reportingTime: '',
    courseCode: '',
    location: '',
    examGroup: '',
    notes: '',
  }
}

// A single editable row in the hall-ticket import draft.
interface DraftRow {
  key: string
  name: string
  subjectId: string
  date: string
  startTime: string
  reportingTime: string
  courseCode: string
  location: string
}

function formatTimeCell(exam: Exam): string {
  if (!exam.startTime && !exam.reportingTime) return '—'
  if (exam.startTime && exam.reportingTime) return `${exam.startTime} (report ${exam.reportingTime})`
  return exam.startTime ?? `report ${exam.reportingTime}`
}

/** Summary shown on a collapsed group so it's still useful shut. */
function dateRangeLabel(list: Exam[]): string {
  if (list.length === 0) return ''
  const first = list[0].date
  const last = list[list.length - 1].date
  return first === last ? first : `${first} → ${last}`
}

export function ExamsPage() {
  const semester = useSettingsStore((s) => s.currentSemester)
  const { exams, loading, load, create, update, remove } = useExamsStore()
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const pushToast = useToastStore((s) => s.push)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [form, setForm] = useState<ExamFormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Exam | null>(null)
  const [saving, setSaving] = useState(false)

  const [draftOpen, setDraftOpen] = useState(false)
  const [draftRows, setDraftRows] = useState<DraftRow[]>([])
  const [draftSource, setDraftSource] = useState('')
  const [draftGroup, setDraftGroup] = useState('')
  // Non-null while a hall ticket is being OCR'd — drives the progress dialog.
  const [progress, setProgress] = useState<PdfOcrProgress | null>(null)

  // Only the user's explicit open/close choices are stored; the default is
  // derived (active semester open, older ones folded; groups open). Deriving
  // rather than seeding state avoids depending on when exams finish loading —
  // other pages populate the same store, so a one-shot init saw a partial list.
  // Group keys are "<semester>::<group>" since each semester has its own
  // Mid/End Semester.
  const [semesterOpen, setSemesterOpen] = useState<Record<string, boolean>>({})
  const [groupOpen, setGroupOpen] = useState<Record<string, boolean>>({})
  const isSemesterOpen = (sem: string) => semesterOpen[sem] ?? sem === semester
  const isGroupOpen = (key: string) => groupOpen[key] ?? true

  useEffect(() => {
    loadSubjects({ includeArchived: false })
  }, [loadSubjects])

  // Every semester, so the page can nest semester > exam group > exams.
  useEffect(() => {
    load()
  }, [load])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const semesterSubjects = useMemo(() => subjects.filter((s) => s.semester === semester), [subjects, semester])

  // semester (newest first) -> sitting (in the order they happen) -> exams.
  const grouped = useMemo(() => groupExams(exams), [exams])

  const groupSuggestions = useMemo(() => {
    const set = new Set<string>(GROUP_SUGGESTIONS)
    for (const e of exams) if (e.examGroup?.trim()) set.add(e.examGroup.trim())
    return [...set].sort()
  }, [exams])

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(exam: Exam) {
    setEditing(exam)
    setForm({
      name: exam.name,
      subjectId: exam.subjectId === null ? NO_SUBJECT : String(exam.subjectId),
      date: exam.date,
      startTime: exam.startTime ?? '',
      reportingTime: exam.reportingTime ?? '',
      courseCode: exam.courseCode ?? '',
      location: exam.location ?? '',
      examGroup: exam.examGroup ?? '',
      notes: exam.notes ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim() || !form.date) return
    setSaving(true)
    try {
      const payload = {
        name: form.name.trim(),
        subjectId: form.subjectId === NO_SUBJECT ? null : Number(form.subjectId),
        date: form.date,
        // Editing keeps the exam where it already lives; new ones land in the
        // semester the switcher is on.
        semester: editing ? editing.semester : semester,
        notes: form.notes.trim() || null,
        courseCode: form.courseCode.trim() || null,
        location: form.location.trim() || null,
        startTime: form.startTime || null,
        reportingTime: form.reportingTime || null,
        examGroup: form.examGroup.trim() || null,
      }
      if (editing) {
        await update(editing.id, payload)
        pushToast({ title: 'Exam updated' })
      } else {
        await create(payload)
        pushToast({ title: 'Exam added' })
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleImportPdf() {
    // Subscribe before opening the picker so no progress event is missed; the
    // dialog only appears once OCR actually starts (after the file is chosen).
    const unsubscribe = window.bunkmate.files.onPdfProgress((p) => setProgress(p))
    try {
      const picked = await window.bunkmate.files.openPdfText()
      if (!picked) return // cancelled
      const rows = parseHallTicket(
        picked.text,
        (semesterSubjects.length > 0 ? semesterSubjects : subjects).map((s) => ({ id: s.id, name: s.name })),
      )
      if (rows.length === 0) {
        pushToast({
          title: 'No exam dates found',
          description: `Couldn't read any exam rows from ${picked.name}. Add them manually, or try a clearer copy.`,
        })
        return
      }
      setDraftRows(
        rows.map((r, i) => ({
          key: `draft-${i}`,
          name: r.name,
          subjectId: r.subjectId === null ? NO_SUBJECT : String(r.subjectId),
          date: r.date,
          startTime: r.startTime ?? '',
          reportingTime: r.reportingTime ?? '',
          courseCode: r.courseCode ?? '',
          location: r.location ?? '',
        })),
      )
      setDraftSource(picked.name)
      setDraftGroup('')
      setDraftOpen(true)
    } catch (err) {
      pushToast({
        title: 'Could not read that PDF',
        description: err instanceof Error ? err.message : 'The file may be encrypted or damaged.',
      })
    } finally {
      unsubscribe()
      setProgress(null)
    }
  }

  async function handleImportIcs() {
    const file = await window.bunkmate.files.openTextFile({ filters: [{ name: 'Calendar', extensions: ['ics'] }] })
    if (!file) return
    const events = parseIcs(file.content)
    const drafts = icsEventsToExamDrafts(
      events,
      (semesterSubjects.length > 0 ? semesterSubjects : subjects).map((s) => ({ id: s.id, name: s.name })),
    )
    if (drafts.length === 0) {
      pushToast({ title: 'No exam dates found', description: `Couldn't read any events from ${file.name}.` })
      return
    }
    setDraftRows(
      drafts.map((r) => ({
        key: r.key,
        name: r.name,
        subjectId: r.subjectId === null ? NO_SUBJECT : String(r.subjectId),
        date: r.date,
        startTime: r.startTime,
        reportingTime: r.reportingTime,
        courseCode: r.courseCode,
        location: r.location,
      })),
    )
    setDraftSource(file.name)
    setDraftGroup('')
    setDraftOpen(true)
  }

  function updateDraftRow(key: string, patch: Partial<DraftRow>) {
    setDraftRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function handleSaveDraft() {
    const valid = draftRows.filter((r) => r.name.trim() && r.date)
    if (valid.length === 0) return
    setSaving(true)
    try {
      for (const r of valid) {
        await create({
          name: r.name.trim(),
          subjectId: r.subjectId === NO_SUBJECT ? null : Number(r.subjectId),
          date: r.date,
          semester,
          notes: null,
          courseCode: r.courseCode.trim() || null,
          location: r.location.trim() || null,
          startTime: r.startTime || null,
          reportingTime: r.reportingTime || null,
          examGroup: draftGroup.trim() || null,
        })
      }
      setDraftOpen(false)
      setDraftRows([])
      pushToast({
        title: `Added ${valid.length} exam${valid.length === 1 ? '' : 's'}`,
        description: draftGroup.trim() ? `${draftGroup.trim()} · from ${draftSource}` : `From ${draftSource}`,
      })
    } finally {
      setSaving(false)
    }
  }

  async function handleExportIcs() {
    // Export the semester currently shown in the switcher.
    const forSemester = exams.filter((e) => e.semester === semester)
    if (forSemester.length === 0) {
      pushToast({ title: 'Nothing to export', description: `No exams in ${semester} yet.` })
      return
    }
    const ics = buildExamsIcs({
      exams: forSemester.map((e) => ({
        id: e.id,
        name: e.name,
        courseCode: e.courseCode,
        date: e.date,
        startTime: e.startTime,
        reportingTime: e.reportingTime,
        location: e.location,
        examGroup: e.examGroup,
      })),
      semesterLabel: semester,
    })
    const path = await window.bunkmate.files.saveFile({
      defaultName: `exams-${semester}.ics`,
      content: ics,
      filters: [{ name: 'Calendar', extensions: ['ics'] }],
    })
    if (path) {
      pushToast({
        title: `Exported ${forSemester.length} exam${forSemester.length === 1 ? '' : 's'}`,
        description: path,
      })
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await remove(target.id)
    setDeleteTarget(null)
    pushToast({ title: 'Exam deleted', description: target.name })
  }

  if (!semester) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-semibold">Exams</h1>
        <p className="text-sm text-muted-foreground">Set up a semester first to track exams.</p>
      </div>
    )
  }

  const validDraftCount = draftRows.filter((r) => r.name.trim() && r.date).length

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Exams</h1>
        <div className="flex items-center gap-3">
          <SemesterSwitcher />
          <Button variant="outline" onClick={handleExportIcs} title="Export this semester's exams to a calendar file">
            <CalendarPlus /> Export .ics
          </Button>
          <Button variant="outline" onClick={handleImportPdf} disabled={progress !== null}>
            <FileUp /> Import hall ticket
          </Button>
          <Button variant="outline" onClick={handleImportIcs} title="Import exam dates from an academic calendar (.ics)">
            <FileUp /> Import .ics
          </Button>
          <Button onClick={openCreate}>
            <Plus /> Add exam
          </Button>
        </div>
      </div>

      {loading && (
        <Card>
          <CardContent className="py-8">
            <Spinner className="mx-auto" />
          </CardContent>
        </Card>
      )}

      {!loading && grouped.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No exams yet. Add one, or import your hall ticket.
          </CardContent>
        </Card>
      )}

      {!loading &&
        grouped.map((sem) => {
          const semOpen = isSemesterOpen(sem.semester)
          return (
          <div key={sem.semester} className="space-y-3">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-md py-1 text-left hover:bg-muted/50"
              aria-expanded={semOpen}
              onClick={() => setSemesterOpen((prev) => ({ ...prev, [sem.semester]: !semOpen }))}
            >
              {semOpen ? (
                <ChevronDown className="size-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-4 text-muted-foreground" />
              )}
              <h2 className="text-lg font-semibold">{sem.semester}</h2>
              <Badge variant="secondary">
                {sem.total} exam{sem.total === 1 ? '' : 's'}
              </Badge>
              {!semOpen && (
                <span className="text-sm text-muted-foreground">
                  {sem.groups.map((g) => `${g.name} (${g.exams.length})`).join(' · ')}
                </span>
              )}
            </button>

            {semOpen &&
              sem.groups.map((group) => {
                const groupKey = `${sem.semester}::${group.name}`
                const grpOpen = isGroupOpen(groupKey)
                return (
              <Card key={group.name}>
                <CardHeader className="py-3">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 text-left"
                    aria-expanded={grpOpen}
                    onClick={() => setGroupOpen((prev) => ({ ...prev, [groupKey]: !grpOpen }))}
                  >
                    {grpOpen ? (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="size-4 text-muted-foreground" />
                    )}
                    <CardTitle className="flex items-center gap-2 text-base">
                      {group.name}
                      <Badge variant="outline" className="font-normal">
                        {group.exams.length}
                      </Badge>
                    </CardTitle>
                    {!grpOpen && (
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {dateRangeLabel(group.exams)}
                      </span>
                    )}
                  </button>
                </CardHeader>
                {grpOpen && (
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Exam</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Time</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>When</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {group.exams.map((exam) => {
                        const days = daysUntil(exam.date)
                        return (
                          <TableRow key={exam.id} className={days < 0 ? 'opacity-50' : undefined}>
                            <TableCell className="font-mono text-xs">{exam.courseCode ?? '—'}</TableCell>
                            <TableCell className="font-medium">{exam.name}</TableCell>
                            <TableCell>
                              {exam.subjectId ? (subjectsById.get(exam.subjectId)?.name ?? '—') : 'All / common'}
                            </TableCell>
                            <TableCell className="tabular-nums">{exam.date}</TableCell>
                            <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">
                              {formatTimeCell(exam)}
                            </TableCell>
                            <TableCell className="max-w-48 truncate text-muted-foreground">
                              {exam.location ?? '—'}
                            </TableCell>
                            <TableCell>
                              <Badge variant={days < 0 ? 'secondary' : days <= 7 ? 'warning' : 'outline'}>
                                {countdownLabel(exam.date)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button size="icon" variant="ghost" onClick={() => openEdit(exam)} aria-label="Edit">
                                  <Pencil />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  onClick={() => setDeleteTarget(exam)}
                                  aria-label="Delete"
                                >
                                  <Trash2 />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
                )}
              </Card>
                )
              })}
          </div>
          )
        })}

      {/* OCR progress — modal so the app clearly isn't stuck. */}
      <Dialog open={progress !== null}>
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>Reading your hall ticket…</DialogTitle>
            <DialogDescription>
              The PDF's text isn't machine-readable, so BunkMate scans the page image instead. This takes a few
              seconds and runs entirely offline.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Progress value={(progress?.progress ?? 0) * 100} />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>{progress?.detail ?? 'Starting…'}</span>
              <span className="tabular-nums">{Math.round((progress?.progress ?? 0) * 100)}%</span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Import draft */}
      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Review imported exams</DialogTitle>
            <DialogDescription>
              Read from {draftSource}. Times and venues come from OCR, so give them a quick check. Edit anything,
              remove rows you don't want, then save. Nothing is added until you do.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-3 rounded-md border bg-muted/30 p-3">
            <div className="space-y-1">
              <Label htmlFor="draft-group">Group these as</Label>
              <Input
                id="draft-group"
                list="exam-group-options"
                className="w-56"
                value={draftGroup}
                onChange={(e) => setDraftGroup(e.target.value)}
                placeholder="End Semester"
              />
            </div>
            <p className="pb-2 text-sm text-muted-foreground">
              Saved under <span className="font-medium">{semester}</span>
              {draftGroup.trim() ? (
                <>
                  {' '}
                  → <span className="font-medium">{draftGroup.trim()}</span>
                </>
              ) : (
                ' (ungrouped)'
              )}
            </p>
          </div>

          <div className="max-h-[45vh] space-y-3 overflow-y-auto pr-1">
            {draftRows.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No rows left. Cancel to start over.</p>
            )}
            {draftRows.map((r) => (
              <div key={r.key} className="space-y-2 rounded-md border p-3">
                <div className="flex items-end gap-2">
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">Code</Label>
                    <Input
                      value={r.courseCode}
                      onChange={(e) => updateDraftRow(r.key, { courseCode: e.target.value })}
                      placeholder="MA231"
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Exam</Label>
                    <Input
                      value={r.name}
                      onChange={(e) => updateDraftRow(r.key, { name: e.target.value })}
                      placeholder="Exam name"
                    />
                  </div>
                  <div className="w-44 space-y-1">
                    <Label className="text-xs text-muted-foreground">Subject</Label>
                    <Select value={r.subjectId} onValueChange={(v) => updateDraftRow(r.key, { subjectId: v })}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NO_SUBJECT}>All / common</SelectItem>
                        {(semesterSubjects.length > 0 ? semesterSubjects : subjects).map((s) => (
                          <SelectItem key={s.id} value={String(s.id)}>
                            {s.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => setDraftRows((rows) => rows.filter((x) => x.key !== r.key))}
                    aria-label="Remove row"
                  >
                    <X />
                  </Button>
                </div>
                <div className="flex items-end gap-2">
                  <div className="w-36 space-y-1">
                    <Label className="text-xs text-muted-foreground">Date</Label>
                    <Input
                      type="date"
                      value={r.date}
                      onChange={(e) => updateDraftRow(r.key, { date: e.target.value })}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">Starts</Label>
                    <Input
                      type="time"
                      value={r.startTime}
                      onChange={(e) => updateDraftRow(r.key, { startTime: e.target.value })}
                    />
                  </div>
                  <div className="w-28 space-y-1">
                    <Label className="text-xs text-muted-foreground">Report by</Label>
                    <Input
                      type="time"
                      value={r.reportingTime}
                      onChange={(e) => updateDraftRow(r.key, { reportingTime: e.target.value })}
                    />
                  </div>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">Location</Label>
                    <Input
                      value={r.location}
                      onChange={(e) => updateDraftRow(r.key, { location: e.target.value })}
                      placeholder="Block / room"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDraftOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveDraft} disabled={saving || validDraftCount === 0}>
              Save {validDraftCount} exam{validDraftCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / edit */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit exam' : 'Add exam'}</DialogTitle>
              <DialogDescription>
                Track a test or exam for {editing ? editing.semester : semester}.
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exam-code">Course code</Label>
                <Input
                  id="exam-code"
                  value={form.courseCode}
                  onChange={(e) => setForm({ ...form, courseCode: e.target.value })}
                  placeholder="MA231"
                />
              </div>
              <div className="col-span-2 space-y-2">
                <Label htmlFor="exam-name">Name</Label>
                <Input
                  id="exam-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="Mathematics - II"
                  required
                  autoFocus
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exam-subject">Subject</Label>
                <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
                  <SelectTrigger id="exam-subject">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SUBJECT}>All / common</SelectItem>
                    {(semesterSubjects.length > 0 ? semesterSubjects : subjects).map((s) => (
                      <SelectItem key={s.id} value={String(s.id)}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-group">Exam group</Label>
                <Input
                  id="exam-group"
                  list="exam-group-options"
                  value={form.examGroup}
                  onChange={(e) => setForm({ ...form, examGroup: e.target.value })}
                  placeholder="End Semester"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-2">
                <Label htmlFor="exam-date">Date</Label>
                <Input
                  id="exam-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-start">Starts</Label>
                <Input
                  id="exam-start"
                  type="time"
                  value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="exam-report">Report by</Label>
                <Input
                  id="exam-report"
                  type="time"
                  value={form.reportingTime}
                  onChange={(e) => setForm({ ...form, reportingTime: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="exam-location">Location</Label>
              <Input
                id="exam-location"
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="BLOCK II - Floor:FIRST - Room:K224"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="exam-notes">Notes (optional)</Label>
              <Input
                id="exam-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Syllabus units 1–3, closed book…"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Add exam'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Shared suggestions for both exam-group inputs. */}
      <datalist id="exam-group-options">
        {groupSuggestions.map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleteTarget?.name}?</DialogTitle>
            <DialogDescription>This removes the exam. It can't be undone.</DialogDescription>
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
    </div>
  )
}
