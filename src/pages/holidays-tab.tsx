import { useEffect, useMemo, useState } from 'react'
import { Plus, Trash2, Pencil, FileUp, FileText, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useHolidaysStore } from '@/store/holidays-store'
import { useToastStore } from '@/store/toast-store'
import type { Holiday } from '../../electron/db/repositories/holidays'
import type { HolidayType } from '@/db/schema'
import { HOLIDAY_TYPES } from '@/db/schema'
import { todayIso } from '@/lib/date-utils'
import { parseIcs } from '@/lib/ics-parser'
import { icsEventsToHolidayDrafts, type HolidayDraftRow } from '@/lib/holidays-import'
import { parseAcademicCalendarText, calendarHolidaysToDrafts } from '@/lib/academic-calendar-pdf-import'

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

type GroupMode = 'none' | 'type' | 'month' | 'year'

function groupKeyFor(h: Holiday, mode: GroupMode): string {
  if (mode === 'type') return h.type.replace('_', ' ')
  if (mode === 'year') return h.date.slice(0, 4)
  if (mode === 'month') {
    const [year, month] = h.date.split('-')
    return `${MONTH_NAMES[Number(month) - 1]} ${year}`
  }
  return ''
}

interface FormState {
  date: string
  type: HolidayType
  label: string
}

function emptyForm(): FormState {
  return { date: todayIso(), type: 'public', label: '' }
}

export function HolidaysTab() {
  const { holidays, load, create, update, remove } = useHolidaysStore()
  const pushToast = useToastStore((s) => s.push)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Holiday | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm())
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null)
  const [saving, setSaving] = useState(false)

  const [importOpen, setImportOpen] = useState(false)
  const [importSource, setImportSource] = useState('')
  const [importRows, setImportRows] = useState<HolidayDraftRow[]>([])
  const [importChecked, setImportChecked] = useState<Record<string, boolean>>({})
  const [importing, setImporting] = useState(false)
  const [importingPdf, setImportingPdf] = useState(false)
  const [groupMode, setGroupMode] = useState<GroupMode>('none')

  useEffect(() => {
    load()
  }, [load])

  const sorted = useMemo(() => [...holidays].sort((a, b) => (a.date < b.date ? -1 : 1)), [holidays])

  const groups = useMemo(() => {
    if (groupMode === 'none') return null
    const map = new Map<string, Holiday[]>()
    for (const h of sorted) {
      const key = groupKeyFor(h, groupMode)
      const bucket = map.get(key)
      if (bucket) bucket.push(h)
      else map.set(key, [h])
    }
    return [...map.entries()]
  }, [sorted, groupMode])

  function openImportReview(source: string, rows: HolidayDraftRow[]) {
    if (rows.length === 0) {
      pushToast({ title: 'No dated events found', description: `Couldn't read any holidays from ${source}.` })
      return
    }
    setImportSource(source)
    setImportRows(rows)
    setImportChecked(Object.fromEntries(rows.map((r) => [r.key, !r.alreadyExists])))
    setImportOpen(true)
  }

  async function handleImportClick() {
    const file = await window.bunkmate.files.openTextFile({ filters: [{ name: 'Calendar', extensions: ['ics'] }] })
    if (!file) return
    const events = parseIcs(file.content)
    const existingDates = new Set(holidays.map((h) => h.date))
    openImportReview(file.name, icsEventsToHolidayDrafts(events, existingDates))
  }

  async function handleImportPdfClick() {
    setImportingPdf(true)
    try {
      const file = await window.bunkmate.files.openDigitalPdfText()
      if (!file) return
      const parsed = parseAcademicCalendarText(file.text)
      const existingDates = new Set(holidays.map((h) => h.date))
      openImportReview(file.name, calendarHolidaysToDrafts(parsed, existingDates))
    } finally {
      setImportingPdf(false)
    }
  }

  function updateImportRow(key: string, patch: Partial<HolidayDraftRow>) {
    setImportRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)))
  }

  async function handleApplyImport() {
    const toApply = importRows.filter((r) => importChecked[r.key])
    if (toApply.length === 0) return
    setImporting(true)
    try {
      for (const r of toApply) {
        await create({ date: r.date, type: r.type, label: r.label.trim() || null })
      }
      setImportOpen(false)
      pushToast({ title: `Imported ${toApply.length} holiday${toApply.length === 1 ? '' : 's'}`, description: importSource })
    } finally {
      setImporting(false)
    }
  }

  const importCheckedCount = importRows.filter((r) => importChecked[r.key]).length

  function openCreate() {
    setEditing(null)
    setForm(emptyForm())
    setDialogOpen(true)
  }

  function openEdit(h: Holiday) {
    setEditing(h)
    setForm({ date: h.date, type: h.type, label: h.label ?? '' })
    setDialogOpen(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = { date: form.date, type: form.type, label: form.label.trim() || null }
      if (editing) {
        await update(editing.id, payload)
        pushToast({ title: 'Holiday updated' })
      } else {
        await create(payload)
        pushToast({ title: 'Holiday added' })
      }
      setDialogOpen(false)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return
    await remove(deleteTarget.id)
    setDeleteTarget(null)
    pushToast({ title: 'Holiday removed' })
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">Public, university, and custom holidays, plus working Saturdays.</p>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={groupMode} onValueChange={(v) => setGroupMode(v as GroupMode)}>
            <SelectTrigger className="w-36" aria-label="Group by">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No grouping</SelectItem>
              <SelectItem value="type">Group by type</SelectItem>
              <SelectItem value="month">Group by month</SelectItem>
              <SelectItem value="year">Group by year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleImportClick} title="Import holidays from an academic calendar (.ics)">
            <FileUp /> Import .ics
          </Button>
          <Button
            variant="outline"
            onClick={handleImportPdfClick}
            disabled={importingPdf}
            title="Import holidays from an academic calendar PDF"
          >
            <FileText /> {importingPdf ? 'Reading PDF…' : 'Import PDF'}
          </Button>
          <Button onClick={openCreate}>
            <Plus /> Add holiday
          </Button>
        </div>
      </div>

      {groups === null ? (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Label</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No holidays on record.
                    </TableCell>
                  </TableRow>
                )}
                {sorted.map((h) => (
                  <TableRow key={h.id}>
                    <TableCell>{h.date}</TableCell>
                    <TableCell className="capitalize">{h.type.replace('_', ' ')}</TableCell>
                    <TableCell>{h.label ?? '—'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => openEdit(h)} aria-label="Edit">
                          <Pencil />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(h)} aria-label="Delete">
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
      ) : (
        <div className="space-y-4">
          {groups.length === 0 && (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">No holidays on record.</CardContent>
            </Card>
          )}
          {groups.map(([key, items]) => (
            <Card key={key}>
              <CardContent className="p-0">
                <div className="border-b px-4 py-2 text-sm font-medium capitalize">
                  {key} <span className="text-muted-foreground">({items.length})</span>
                </div>
                <Table>
                  <TableBody>
                    {items.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="w-28">{h.date}</TableCell>
                        <TableCell className="w-32 capitalize">{h.type.replace('_', ' ')}</TableCell>
                        <TableCell>{h.label ?? '—'}</TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button size="icon" variant="ghost" onClick={() => openEdit(h)} aria-label="Edit">
                              <Pencil />
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(h)} aria-label="Delete">
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
          ))}
        </div>
      )}

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Review imported holidays</DialogTitle>
            <DialogDescription>
              Read from {importSource}. Dates that already have a holiday start unchecked. Edit a label, uncheck a
              row you don't want, then import. Nothing is added until you do.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {importRows.map((r) => (
              <div key={r.key} className="flex items-center gap-2 rounded-md border p-2">
                <Checkbox
                  checked={importChecked[r.key] ?? false}
                  onCheckedChange={(v) => setImportChecked((c) => ({ ...c, [r.key]: v === true }))}
                  aria-label="Import this row"
                />
                <span className="w-28 shrink-0 text-sm text-muted-foreground">
                  {r.date}
                  {r.alreadyExists && <span className="block text-xs text-warning">already exists</span>}
                </span>
                <Input
                  value={r.label}
                  onChange={(e) => updateImportRow(r.key, { label: e.target.value })}
                  className="flex-1"
                />
                <Select value={r.type} onValueChange={(v) => updateImportRow(r.key, { type: v as HolidayType })}>
                  <SelectTrigger className="w-36">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLIDAY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => setImportRows((rows) => rows.filter((x) => x.key !== r.key))}
                  aria-label="Remove row"
                >
                  <X />
                </Button>
              </div>
            ))}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyImport} disabled={importing || importCheckedCount === 0}>
              Import {importCheckedCount} holiday{importCheckedCount === 1 ? '' : 's'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>{editing ? 'Edit holiday' : 'Add holiday'}</DialogTitle>
              <DialogDescription>
                Holidays exclude scheduled periods that day, except working Saturdays.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="holiday-date">Date</Label>
                <Input
                  id="holiday-date"
                  type="date"
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="holiday-type">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as HolidayType })}>
                  <SelectTrigger id="holiday-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {HOLIDAY_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t.replace('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="holiday-label">Label</Label>
              <Input
                id="holiday-label"
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                placeholder="Independence Day"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {editing ? 'Save changes' : 'Add holiday'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this holiday?</DialogTitle>
            <DialogDescription>Scheduled periods on this date will count normally again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
