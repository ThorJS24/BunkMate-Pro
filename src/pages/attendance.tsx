import { useEffect, useMemo, useState } from 'react'
import { Plus, Pencil, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
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
import { useSubjectsStore } from '@/store/subjects-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'
import type { AttendanceRecord } from '../../electron/db/repositories/attendance-records'
import type { AttendanceStatus } from '@/db/schema'
import { todayIso } from '@/lib/date-utils'
import { useHotkey } from '@/hooks/use-hotkey'
import {
  parseAttendanceCsv,
  reconcileImport,
  reconcileKey,
  type ReconcileResult,
  type ParseError,
} from '@/lib/attendance-import'

function startOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

interface RecordFormState {
  subjectId: string
  date: string
  period: string
  status: AttendanceStatus
}

function emptyForm(defaultSubjectId: string): RecordFormState {
  return { subjectId: defaultSubjectId, date: todayIso(), period: '1', status: 'present' }
}

export function AttendancePage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { records, loading, load, create, update, remove } = useAttendanceStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const pushToast = useToastStore((s) => s.push)

  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | AttendanceStatus>('all')
  const [dateFrom, setDateFrom] = useState(startOfMonth())
  const [dateTo, setDateTo] = useState(todayIso())
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<AttendanceRecord | null>(null)
  const [form, setForm] = useState<RecordFormState>(emptyForm(''))
  const [deleteTarget, setDeleteTarget] = useState<AttendanceRecord | null>(null)
  const [saving, setSaving] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importFileName, setImportFileName] = useState('')
  const [importResult, setImportResult] = useState<ReconcileResult | null>(null)
  const [importErrors, setImportErrors] = useState<ParseError[]>([])
  // key -> existing record, so an 'update' entry can find the row id to patch.
  const [importExistingByKey, setImportExistingByKey] = useState<Map<string, AttendanceRecord>>(new Map())
  const [importApplying, setImportApplying] = useState(false)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
  }, [loadSubjects])

  useEffect(() => {
    load({
      subjectId: subjectFilter === 'all' ? undefined : Number(subjectFilter),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
  }, [load, subjectFilter, dateFrom, dateTo])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // Lightweight audit: the most recently created/edited records in the current
  // filter, newest first — a quick "what did I just change" without a separate
  // history table.
  const recentlyChanged = useMemo(
    () =>
      [...records]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [records],
  )

  const sortedRecords = useMemo(
    () =>
      [...records]
        .filter((r) => statusFilter === 'all' || r.status === statusFilter)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.period - b.period)),
    [records, statusFilter],
  )

  function openCreateDialog() {
    setEditing(null)
    setForm(emptyForm(subjects[0] ? String(subjects[0].id) : ''))
    setDialogOpen(true)
  }

  useHotkey('n', openCreateDialog, subjects.length > 0)

  function openEditDialog(record: AttendanceRecord) {
    setEditing(record)
    setForm({
      subjectId: String(record.subjectId),
      date: record.date,
      period: String(record.period),
      status: record.status,
    })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subjectId) return

    setSaving(true)
    try {
      if (editing) {
        await update(editing.id, {
          subjectId: Number(form.subjectId),
          date: form.date,
          period: Math.max(1, Number(form.period) || 1),
          status: form.status,
        })
        pushToast({ title: 'Attendance updated' })
      } else {
        await create({
          subjectId: Number(form.subjectId),
          date: form.date,
          period: Math.max(1, Number(form.period) || 1),
          status: form.status,
          source: 'manual',
          slotId: null,
        })
        pushToast({ title: 'Attendance recorded' })
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return
    const target = deleteTarget
    await remove(target.id)
    setDeleteTarget(null)
    pushToast({
      title: 'Record deleted',
      action: {
        label: 'Undo',
        onClick: () => {
          create({
            subjectId: target.subjectId,
            date: target.date,
            period: target.period,
            status: target.status,
            source: target.source,
            slotId: target.slotId,
          })
        },
      },
    })
  }

  async function handleImport() {
    const file = await window.bunkmate.files.openTextFile({ filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] })
    if (!file) return
    const { rows, errors } = parseAttendanceCsv(file.content)

    // Match against the active semester's subjects; reconcile against ALL
    // stored records (not the filtered view) so nothing is misjudged as new.
    const semesterSubjects = subjects.filter((s) => s.semester === currentSemester)
    const subjectIdByName = new Map(semesterSubjects.map((s) => [s.name.toLowerCase(), s.id]))
    const allRecords = await window.bunkmate.attendanceRecords.list()
    const existingByKey = new Map<string, AttendanceRecord>()
    const existingStatusByKey = new Map<string, 'present' | 'absent'>()
    for (const r of allRecords) {
      const key = reconcileKey(r.subjectId, r.date, r.period)
      existingByKey.set(key, r)
      existingStatusByKey.set(key, r.status)
    }

    const result = reconcileImport({ rows, subjectIdByName, existingStatusByKey })
    setImportFileName(file.name)
    setImportErrors(errors)
    setImportExistingByKey(existingByKey)
    setImportResult(result)
    setImportOpen(true)
  }

  async function applyImport() {
    if (!importResult) return
    setImportApplying(true)
    try {
      let created = 0
      let updated = 0
      for (const entry of importResult.entries) {
        if (entry.subjectId === null) continue
        if (entry.action === 'create') {
          await create({
            subjectId: entry.subjectId,
            date: entry.row.date,
            period: entry.row.period,
            status: entry.row.status,
            source: 'manual',
            slotId: null,
          })
          created++
        } else if (entry.action === 'update') {
          const existing = importExistingByKey.get(reconcileKey(entry.subjectId, entry.row.date, entry.row.period))
          if (existing) {
            await update(existing.id, { status: entry.row.status })
            updated++
          }
        }
      }
      await load({
        subjectId: subjectFilter === 'all' ? undefined : Number(subjectFilter),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
      pushToast({ title: 'Import applied', description: `${created} added, ${updated} updated.` })
      setImportOpen(false)
    } finally {
      setImportApplying(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleImport} disabled={subjects.length === 0} title="Import attendance from a CSV (date, subject, period, status)">
            <Upload /> Import CSV
          </Button>
          <Button onClick={openCreateDialog} disabled={subjects.length === 0}>
            <Plus /> Mark Attendance
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-2">
          <Label htmlFor="subject-filter">Subject</Label>
          <Select value={subjectFilter} onValueChange={setSubjectFilter}>
            <SelectTrigger id="subject-filter" className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All subjects</SelectItem>
              {subjects.map((s) => (
                <SelectItem key={s.id} value={String(s.id)}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-from">From</Label>
          <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date-to">To</Label>
          <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-filter">Status</Label>
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | AttendanceStatus)}>
            <SelectTrigger id="status-filter" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="present">Present</SelectItem>
              <SelectItem value="absent">Absent</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {recentlyChanged.length > 0 && (
        <div className="rounded-lg border bg-muted/30 p-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">Recently changed</p>
          <div className="flex flex-wrap gap-2">
            {recentlyChanged.map((r) => (
              <span key={r.id} className="flex items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs">
                <span className="font-medium">{subjectsById.get(r.subjectId)?.name ?? `#${r.subjectId}`}</span>
                <span className="tabular-nums text-muted-foreground">
                  {r.date}·P{r.period}
                </span>
                <Badge variant={r.status === 'present' ? 'success' : 'destructive'} className="px-1 text-[10px]">
                  {r.status}
                </Badge>
              </span>
            ))}
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    <Spinner className="mx-auto" />
                  </TableCell>
                </TableRow>
              )}
              {sortedRecords.length === 0 && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No attendance records in this range.
                  </TableCell>
                </TableRow>
              )}
              {!loading && sortedRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell>{record.date}</TableCell>
                  <TableCell>{record.period}</TableCell>
                  <TableCell>{subjectsById.get(record.subjectId)?.name ?? `#${record.subjectId}`}</TableCell>
                  <TableCell>
                    <Badge variant={record.status === 'present' ? 'success' : 'destructive'}>
                      {record.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{record.source}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" onClick={() => openEditDialog(record)} aria-label="Edit">
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => setDeleteTarget(record)}
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
              <DialogTitle>{editing ? 'Edit attendance' : 'Mark attendance'}</DialogTitle>
              <DialogDescription>
                {editing ? 'Update this attendance record.' : 'Record attendance for a subject and period.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="record-subject">Subject</Label>
              <Select value={form.subjectId} onValueChange={(v) => setForm({ ...form, subjectId: v })}>
                <SelectTrigger id="record-subject">
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
                <Label htmlFor="record-date">Date</Label>
                <Input
                  id="record-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="record-period">Period</Label>
                <Input
                  id="record-period"
                  type="number"
                  min={1}
                  value={form.period}
                  onChange={(e) => setForm({ ...form, period: e.target.value })}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="record-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => setForm({ ...form, status: v as AttendanceStatus })}
              >
                <SelectTrigger id="record-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Mark attendance'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this record?</DialogTitle>
            <DialogDescription>You can undo this immediately after deleting.</DialogDescription>
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

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import preview: {importFileName}</DialogTitle>
            <DialogDescription>
              Matched against {currentSemester || 'the active semester'}'s subjects. Nothing is applied until you
              confirm, and existing records the file doesn't mention are never touched.
            </DialogDescription>
          </DialogHeader>

          {importResult && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge variant="success">{importResult.counts.create} new</Badge>
                <Badge variant="warning">{importResult.counts.update} changed</Badge>
                <Badge variant="outline">{importResult.counts.unchanged} unchanged</Badge>
                {importResult.counts.unmatched > 0 && (
                  <Badge variant="destructive">{importResult.counts.unmatched} unmatched</Badge>
                )}
                {importErrors.length > 0 && (
                  <Badge variant="destructive">{importErrors.length} invalid row(s)</Badge>
                )}
              </div>

              <div className="max-h-64 space-y-1 overflow-y-auto text-xs">
                {importResult.entries
                  .filter((e) => e.action === 'create' || e.action === 'update' || e.action === 'unmatched')
                  .slice(0, 200)
                  .map((e, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 rounded border px-2 py-1">
                      <span className="truncate">
                        {e.row.date} · {e.row.subjectName} · P{e.row.period}
                      </span>
                      {e.action === 'create' && <span className="text-success">+ {e.row.status}</span>}
                      {e.action === 'update' && (
                        <span className="text-warning">
                          {e.existingStatus} → {e.row.status}
                        </span>
                      )}
                      {e.action === 'unmatched' && <span className="text-destructive">no subject match</span>}
                    </div>
                  ))}
                {importErrors.slice(0, 50).map((err) => (
                  <div key={`err-${err.rowNumber}`} className="rounded border border-destructive/40 px-2 py-1 text-destructive">
                    Row {err.rowNumber}: {err.message}
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={applyImport}
              disabled={
                importApplying ||
                !importResult ||
                importResult.counts.create + importResult.counts.update === 0
              }
            >
              Apply {importResult ? importResult.counts.create + importResult.counts.update : 0} change(s)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
