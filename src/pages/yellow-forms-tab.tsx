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
import { useSubjectsStore } from '@/store/subjects-store'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import { useToastStore } from '@/store/toast-store'
import { YellowFormDisputeBadge } from '@/components/yellow-form-dispute'
import type { YellowForm } from '../../electron/db/repositories/yellow-forms'
import { todayIso } from '@/lib/date-utils'

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

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<YellowForm | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm(''))
  const [deleteTarget, setDeleteTarget] = useState<YellowForm | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    load()
  }, [loadSubjects, load])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // Grouped by date (newest first) so you can cross-verify a whole day's forms
  // against the portal at a glance; within a day, ordered by period.
  const groups = useMemo(() => {
    const byDate = new Map<string, YellowForm[]>()
    for (const f of forms) {
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
  }, [forms])

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
    await remove(deleteTarget.id)
    setDeleteTarget(null)
    pushToast({ title: 'Yellow form deleted' })
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

      <Card>
        <CardContent className="p-0">
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
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                    No yellow forms on record.
                  </TableCell>
                </TableRow>
              )}
              {groups.map((group) => (
                <Fragment key={group.date}>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableCell colSpan={6} className="py-2 font-medium">
                      {formatDateLabel(group.date)}
                      <Badge variant="secondary" className="ml-2 font-normal">
                        {group.forms.length} form{group.forms.length === 1 ? '' : 's'}
                      </Badge>
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
                      <YellowFormDisputeBadge form={f} subjectName={subjectsById.get(f.subjectId)?.name ?? `#${f.subjectId}`} />
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
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

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
