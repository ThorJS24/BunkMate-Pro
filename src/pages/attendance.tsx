import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  Pencil,
  Trash2,
  Upload,
  Zap,
  Calendar,
} from 'lucide-react'
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
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { EsproComparisonTable } from '@/components/espro-comparison-table'
import { EsproDayComparisonTable } from '@/components/espro-day-comparison-table'
import { QuickEsproSyncButton } from '@/components/quick-espro-sync'
import { SemesterSwitcher } from '@/components/semester-switcher'
import { CollapsibleSection } from '@/components/collapsible-section'
import type { EsproStatus } from '../../electron/espro/types'
import type { EsproComparisonResult } from '../../electron/espro/sync'
import { useSubjectsStore } from '@/store/subjects-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'
import { friendlyError } from '@/lib/friendly-error'
import { useYellowFormsStore } from '@/store/yellow-forms-store'
import type { AttendanceRecord } from '../../electron/db/repositories/attendance-records'
import type { AttendanceStatus } from '@/db/schema'
import { todayIso, groupByMonth, groupByDay } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
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

function startOfSemester(): string {
  const d = new Date()
  const m = d.getMonth() + 1
  const year = m < 6 ? d.getFullYear() - 1 : d.getFullYear()
  const startMonth = m >= 6 && m <= 10 ? '06' : '11'
  return `${year}-${startMonth}-01`
}

export type ExtendedStatus = 'present' | 'absent' | 'yellow_form' | 'blue_form'

interface RecordFormState {
  subjectId: string
  date: string
  period: string
  status: ExtendedStatus
  reason: string
}

function emptyForm(defaultSubjectId: string): RecordFormState {
  return { subjectId: defaultSubjectId, date: todayIso(), period: '1', status: 'present', reason: '' }
}

export function AttendancePage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { records, loading, load, create, update, remove } = useAttendanceStore()
  const {
    forms: yellowForms,
    load: loadYellowForms,
    create: createYellowForm,
    remove: removeYellowForm,
  } = useYellowFormsStore()
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const pushToast = useToastStore((s) => s.push)

  const [subjectFilter, setSubjectFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | ExtendedStatus>('all')
  const [dateFrom, setDateFrom] = useState(startOfSemester())
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
  const [importExistingByKey, setImportExistingByKey] = useState<Map<string, AttendanceRecord>>(new Map())
  const [importApplying, setImportApplying] = useState(false)
  const [groupBy, setGroupBy] = useState<'month_day' | 'subject' | 'date' | 'flat'>('month_day')

  const [esproStatus, setEsproStatus] = useState<EsproStatus | null>(null)
  const [esproComparing, setEsproComparing] = useState(false)
  const [esproResult, setEsproResult] = useState<EsproComparisonResult | null>(null)
  const [esproSyncing, setEsproSyncing] = useState(false)
  const [esproError, setEsproError] = useState<string | null>(null)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadYellowForms()
    window.bunkmate.espro.getStatus().then(setEsproStatus).catch(() => setEsproStatus(null))
  }, [loadSubjects, loadYellowForms])

  useEffect(() => {
    if (window.bunkmate?.espro?.onAutoSynced) {
      return window.bunkmate.espro.onAutoSynced(() => {
        load({
          subjectId: subjectFilter === 'all' ? undefined : Number(subjectFilter),
          dateFrom: dateFrom || undefined,
          dateTo: dateTo || undefined,
        })
      })
    }
  }, [load, subjectFilter, dateFrom, dateTo])

  async function handleCompareEspro() {
    if (!currentSemester) return
    setEsproComparing(true)
    setEsproError(null)
    try {
      setEsproResult(await window.bunkmate.espro.compareAttendance(currentSemester))
    } catch (err) {
      setEsproError(friendlyError(err).message)
    } finally {
      setEsproComparing(false)
    }
  }

  async function handleSyncEspro() {
    if (!currentSemester) return
    setEsproSyncing(true)
    setEsproError(null)
    try {
      const result = await window.bunkmate.espro.syncAttendance(currentSemester)
      if (result.missingPeriodTimes) {
        pushToast({
          title: "Can't sync yet",
          description: 'Allocate period times for this semester first (Timetable > Grid Settings).',
        })
        return
      }
      const parts: string[] = []
      if (result.created > 0) parts.push(`${result.created} added`)
      if (result.updated > 0) parts.push(`${result.updated} corrected`)
      if (result.unchanged > 0) parts.push(`${result.unchanged} matched`)
      pushToast({
        title: parts.length > 0 ? `Synced: ${parts.join(', ')}` : 'Already up to date',
        description:
          result.unmatchedDates.length > 0
            ? `Couldn't match ${result.unmatchedDates.length} date${result.unmatchedDates.length === 1 ? '' : 's'}.`
            : undefined,
      })
      await load({
        subjectId: subjectFilter === 'all' ? undefined : Number(subjectFilter),
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      })
    } catch (err) {
      setEsproError(friendlyError(err).message)
    } finally {
      setEsproSyncing(false)
    }
  }

  useEffect(() => {
    load({
      subjectId: subjectFilter === 'all' ? undefined : Number(subjectFilter),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
    })
  }, [load, subjectFilter, dateFrom, dateTo])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  // Keyed by `${subjectId}_${date}_${period}`
  const yellowFormMap = useMemo(() => {
    const map = new Map<string, typeof yellowForms[number]>()
    for (const f of yellowForms) {
      if (f.period !== null) {
        map.set(`${f.subjectId}_${f.date}_${f.period}`, f)
      } else {
        // null period covers all periods for that subject on that date
        map.set(`${f.subjectId}_${f.date}_all`, f)
      }
    }
    return map
  }, [yellowForms])

  const getYellowFormForRecord = (r: AttendanceRecord) => {
    return yellowFormMap.get(`${r.subjectId}_${r.date}_${r.period}`) ?? yellowFormMap.get(`${r.subjectId}_${r.date}_all`)
  }

  const getExtendedStatusForRecord = (r: AttendanceRecord): ExtendedStatus => {
    const yf = getYellowFormForRecord(r)
    if (yf) {
      const isBlue = yf.reason?.toLowerCase().includes('blue form')
      return isBlue ? 'blue_form' : 'yellow_form'
    }
    return r.status
  }

  const sortedRecords = useMemo(
    () =>
      [...records]
        .filter((r) => {
          if (statusFilter === 'all') return true
          return getExtendedStatusForRecord(r) === statusFilter
        })
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.period - b.period)),
    [records, statusFilter, yellowFormMap],
  )

  const monthGroups = useMemo(() => groupByMonth(sortedRecords, (r) => r.date), [sortedRecords])

  const subjectGroups = useMemo(() => {
    const map = new Map<number, AttendanceRecord[]>()
    for (const r of sortedRecords) {
      const list = map.get(r.subjectId) ?? []
      list.push(r)
      map.set(r.subjectId, list)
    }
    return Array.from(map.entries()).map(([subId, items]) => ({
      subjectId: subId,
      name: subjectsById.get(subId)?.name ?? `Subject #${subId}`,
      items,
    }))
  }, [sortedRecords, subjectsById])

  const dateGroups = useMemo(() => {
    return groupByDay(sortedRecords, (r) => r.date)
  }, [sortedRecords])

  const metrics = useMemo(() => {
    const total = sortedRecords.length
    let present = 0
    let absent = 0
    let yellowCount = 0
    let blueCount = 0
    let esproSynced = 0

    for (const r of sortedRecords) {
      if (r.source === 'espro') esproSynced++
      const extStatus = getExtendedStatusForRecord(r)
      if (extStatus === 'present') present++
      else if (extStatus === 'absent') absent++
      else if (extStatus === 'yellow_form') {
        yellowCount++
        present++ // Counted as attended in calculation
      } else if (extStatus === 'blue_form') {
        blueCount++
        present++ // Counted as attended in calculation
      }
    }
    const percentage = total > 0 ? (present / total) * 100 : 0
    return { total, present, absent, yellowCount, blueCount, esproSynced, percentage }
  }, [sortedRecords, yellowFormMap])

  function openCreateDialog() {
    setEditing(null)
    setForm(emptyForm(subjects[0] ? String(subjects[0].id) : ''))
    setDialogOpen(true)
  }

  useHotkey('n', openCreateDialog, subjects.length > 0)

  function openEditDialog(record: AttendanceRecord) {
    setEditing(record)
    const existingYf = getYellowFormForRecord(record)
    const extStatus = getExtendedStatusForRecord(record)
    setForm({
      subjectId: String(record.subjectId),
      date: record.date,
      period: String(record.period),
      status: extStatus,
      reason: existingYf?.reason ?? '',
    })
    setDialogOpen(true)
  }

  async function handleSetStatus(record: AttendanceRecord, targetStatus: ExtendedStatus, customReason?: string) {
    const existingYf = getYellowFormForRecord(record)

    if (targetStatus === 'present' || targetStatus === 'absent') {
      await update(record.id, { status: targetStatus })
      if (existingYf) {
        await removeYellowForm(existingYf.id)
      }
      pushToast({ title: `Marked as ${targetStatus === 'present' ? 'Present' : 'Absent'}` })
    } else {
      // Yellow Form or Blue Form
      await update(record.id, { status: 'absent' }) // Absences with approved forms count as attended
      const reasonText = customReason !== undefined
        ? customReason
        : (targetStatus === 'blue_form' ? 'Blue Form - Duty/Medical Leave' : 'Yellow Form - Duty/Co-Curricular Leave')

      if (existingYf) {
        await window.bunkmate.yellowForms.update(existingYf.id, { reason: reasonText, status: 'approved' })
        await loadYellowForms()
      } else {
        await createYellowForm({
          subjectId: record.subjectId,
          date: record.date,
          period: record.period,
          reason: reasonText,
        })
        // Set approved
        const createdForm = yellowForms.find(
          (f) => f.subjectId === record.subjectId && f.date === record.date && f.period === record.period,
        )
        if (createdForm) {
          await window.bunkmate.yellowForms.setStatus(createdForm.id, 'approved')
          await loadYellowForms()
        }
      }
      pushToast({ title: `Filed ${targetStatus === 'blue_form' ? 'Blue Form' : 'Yellow Form'}` })
    }
    await loadYellowForms()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.subjectId) return

    setSaving(true)
    try {
      const subjectIdNum = Number(form.subjectId)
      const periodNum = Math.max(1, Number(form.period) || 1)
      const baseStatus: AttendanceStatus = (form.status === 'yellow_form' || form.status === 'blue_form') ? 'absent' : form.status

      let targetRecord = editing
      if (editing) {
        targetRecord = await update(editing.id, {
          subjectId: subjectIdNum,
          date: form.date,
          period: periodNum,
          status: baseStatus,
        })
        pushToast({ title: 'Attendance updated' })
      } else {
        targetRecord = await create({
          subjectId: subjectIdNum,
          date: form.date,
          period: periodNum,
          status: baseStatus,
          source: 'manual',
          slotId: null,
        })
        pushToast({ title: 'Attendance recorded' })
      }

      // Handle yellow/blue form updates
      const existingYf = getYellowFormForRecord(targetRecord)
      if (form.status === 'yellow_form' || form.status === 'blue_form') {
        const reasonText = form.reason || (form.status === 'blue_form' ? 'Blue Form - Duty/Medical Leave' : 'Yellow Form - Duty/Co-Curricular Leave')
        if (existingYf) {
          await window.bunkmate.yellowForms.update(existingYf.id, { reason: reasonText, status: 'approved' })
        } else {
          const newF = await createYellowForm({
            subjectId: subjectIdNum,
            date: form.date,
            period: periodNum,
            reason: reasonText,
          })
          await window.bunkmate.yellowForms.setStatus(newF.id, 'approved')
        }
      } else if (existingYf) {
        await removeYellowForm(existingYf.id)
      }
      await loadYellowForms()
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
    pushToast(
      {
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
      },
      8000,
    )
  }

  async function handleImport() {
    const file = await window.bunkmate.files.openTextFile({ filters: [{ name: 'CSV', extensions: ['csv', 'txt'] }] })
    if (!file) return
    const { rows, errors } = parseAttendanceCsv(file.content)
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

  function setPresetRange(range: 'month' | '30days' | 'term') {
    if (range === 'month') {
      setDateFrom(startOfMonth())
      setDateTo(todayIso())
    } else if (range === '30days') {
      const d = new Date()
      d.setDate(d.getDate() - 30)
      setDateFrom(d.toISOString().slice(0, 10))
      setDateTo(todayIso())
    } else {
      setDateFrom(startOfSemester())
      setDateTo(todayIso())
    }
  }

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold">Attendance Log</h1>
            <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1 text-xs dark:text-emerald-400">
              <Zap className="size-3 text-emerald-500" /> ESPRO Auto-Synced
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Complete attendance history automatically synced from ESPRO. Adjust or audit records anytime.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <SemesterSwitcher />
          <QuickEsproSyncButton variant="default" size="sm" />
          <Button variant="outline" size="sm" onClick={handleImport} disabled={subjects.length === 0} title="Import attendance CSV">
            <Upload className="size-3.5 mr-1.5" /> Import CSV
          </Button>
          <Button size="sm" onClick={openCreateDialog} disabled={subjects.length === 0}>
            <Plus className="size-3.5 mr-1.5" /> Mark Class
          </Button>
        </div>
      </div>

      {/* Summary Stat Bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Card className="p-3.5 bg-card/60">
          <p className="text-xs font-medium text-muted-foreground">Total Classes</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums">{metrics.total}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Recorded in selection</p>
        </Card>
        <Card className="p-3.5 bg-card/60">
          <p className="text-xs font-medium text-muted-foreground">Present Rate</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-emerald-600 dark:text-emerald-400">
            {metrics.total > 0 ? `${metrics.percentage.toFixed(1)}%` : '—'}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">{metrics.present} periods attended</p>
        </Card>
        <Card className="p-3.5 bg-card/60">
          <p className="text-xs font-medium text-muted-foreground">Absences</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-rose-600 dark:text-rose-400">{metrics.absent}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Unexcused missed</p>
        </Card>
        <Card className="p-3.5 bg-card/60">
          <p className="text-xs font-medium text-muted-foreground">Yellow / Blue Forms</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-amber-500">
            {metrics.yellowCount + metrics.blueCount}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {metrics.yellowCount} Yellow · {metrics.blueCount} Blue
          </p>
        </Card>
        <Card className="p-3.5 bg-card/60">
          <p className="text-xs font-medium text-muted-foreground">ESPRO Synced</p>
          <p className="text-2xl font-semibold mt-1 tabular-nums text-primary">{metrics.esproSynced}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Auto-verified logs</p>
        </Card>
      </div>

      {/* Filter & Toolbar */}
      <Card className="p-4 bg-card/50">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-3">
            <div className="space-y-1">
              <Label htmlFor="subject-filter" className="text-xs text-muted-foreground">Subject</Label>
              <Select value={subjectFilter} onValueChange={setSubjectFilter}>
                <SelectTrigger id="subject-filter" className="w-48 h-9 text-xs">
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

            <div className="space-y-1">
              <Label htmlFor="status-filter" className="text-xs text-muted-foreground">Status</Label>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | ExtendedStatus)}>
                <SelectTrigger id="status-filter" className="w-36 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="present">Present</SelectItem>
                  <SelectItem value="absent">Absent</SelectItem>
                  <SelectItem value="yellow_form">Yellow Form</SelectItem>
                  <SelectItem value="blue_form">Blue Form</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label htmlFor="group-by" className="text-xs text-muted-foreground">Group By</Label>
              <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
                <SelectTrigger id="group-by" className="w-36 h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="month_day">Month & Day</SelectItem>
                  <SelectItem value="subject">By Subject</SelectItem>
                  <SelectItem value="date">By Date</SelectItem>
                  <SelectItem value="flat">Flat List</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Range Presets</Label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs" onClick={() => setPresetRange('month')}>
                  This Month
                </Button>
                <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs" onClick={() => setPresetRange('30days')}>
                  Last 30 Days
                </Button>
                <Button variant="outline" size="sm" className="h-9 px-2.5 text-xs" onClick={() => setPresetRange('term')}>
                  Full Term
                </Button>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="space-y-1">
              <Label htmlFor="date-from" className="text-xs text-muted-foreground">From</Label>
              <Input id="date-from" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 text-xs w-36" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="date-to" className="text-xs text-muted-foreground">To</Label>
              <Input id="date-to" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="h-9 text-xs w-36" />
            </div>
          </div>
        </div>
      </Card>

      {/* Main Full-Width Master Attendance Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle>Attendance Log</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Set status directly to Present, Absent, Yellow Form, or Blue Form with optional reasons
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-normal text-xs">
            {sortedRecords.length} record{sortedRecords.length === 1 ? '' : 's'}
          </Badge>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading && (
            <div className="py-12 text-center">
              <Spinner className="mx-auto" />
            </div>
          )}
          {!loading && sortedRecords.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <Calendar className="mx-auto size-8 opacity-40 mb-2" />
              No attendance records found in this range or filter selection.
            </div>
          )}
          {!loading && sortedRecords.length > 0 && (
            <>
              {groupBy === 'flat' && (
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-b/50 text-xs">
                      <TableHead className="w-16">Period</TableHead>
                      <TableHead className="w-28">Date</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead className="w-48">Status & Form</TableHead>
                      <TableHead className="w-32">Source</TableHead>
                      <TableHead className="w-24 text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedRecords.map((record) => {
                      const extStatus = getExtendedStatusForRecord(record)
                      const yf = getYellowFormForRecord(record)
                      return (
                        <TableRow key={record.id} className="hover:bg-muted/40 transition-colors">
                          <TableCell className="font-medium text-xs">Period {record.period}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{record.date}</TableCell>
                          <TableCell className="font-medium">
                            {subjectsById.get(record.subjectId)?.name ?? `#${record.subjectId}`}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Select
                                value={extStatus}
                                onValueChange={(val) => handleSetStatus(record, val as ExtendedStatus)}
                              >
                                <SelectTrigger className={cn(
                                  'h-7 text-xs font-medium w-36',
                                  extStatus === 'present' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
                                  extStatus === 'absent' && 'bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400',
                                  extStatus === 'yellow_form' && 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
                                  extStatus === 'blue_form' && 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400'
                                )}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="present">🟢 Present</SelectItem>
                                  <SelectItem value="absent">🔴 Absent</SelectItem>
                                  <SelectItem value="yellow_form">🟡 Yellow Form</SelectItem>
                                  <SelectItem value="blue_form">🔵 Blue Form</SelectItem>
                                </SelectContent>
                              </Select>
                              {yf?.reason && (
                                <span className="text-[11px] text-muted-foreground italic truncate max-w-[140px]" title={yf.reason}>
                                  ({yf.reason})
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className="font-normal text-[11px] text-muted-foreground uppercase tracking-wider">
                              {record.source === 'espro' ? '⚡ ESPRO' : '✍️ Manual'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDialog(record)} aria-label="Edit">
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => setDeleteTarget(record)}
                                aria-label="Delete"
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}

              {groupBy === 'subject' &&
                subjectGroups.map((grp) => {
                  const extStatuses = grp.items.map((r) => getExtendedStatusForRecord(r))
                  const present = extStatuses.filter((s) => s === 'present' || s === 'yellow_form' || s === 'blue_form').length
                  const absent = extStatuses.filter((s) => s === 'absent').length
                  const pct = grp.items.length > 0 ? (present / grp.items.length) * 100 : 0
                  return (
                    <CollapsibleSection
                      key={grp.subjectId}
                      title={grp.name}
                      summary={`${present}/${grp.items.length} Attended (${pct.toFixed(1)}%) · ${absent} Absent`}
                      defaultOpen={true}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-b/50 text-xs">
                            <TableHead className="w-16">Period</TableHead>
                            <TableHead className="w-28">Date</TableHead>
                            <TableHead className="w-48">Status & Form</TableHead>
                            <TableHead className="w-32">Source</TableHead>
                            <TableHead className="w-24 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {grp.items.map((record) => {
                            const extStatus = getExtendedStatusForRecord(record)
                            const yf = getYellowFormForRecord(record)
                            return (
                              <TableRow key={record.id} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="font-medium text-xs">Period {record.period}</TableCell>
                                <TableCell className="text-xs text-muted-foreground">{record.date}</TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={extStatus}
                                      onValueChange={(val) => handleSetStatus(record, val as ExtendedStatus)}
                                    >
                                      <SelectTrigger className={cn(
                                        'h-7 text-xs font-medium w-36',
                                        extStatus === 'present' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
                                        extStatus === 'absent' && 'bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400',
                                        extStatus === 'yellow_form' && 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
                                        extStatus === 'blue_form' && 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400'
                                      )}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="present">🟢 Present</SelectItem>
                                        <SelectItem value="absent">🔴 Absent</SelectItem>
                                        <SelectItem value="yellow_form">🟡 Yellow Form</SelectItem>
                                        <SelectItem value="blue_form">🔵 Blue Form</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {yf?.reason && (
                                      <span className="text-[11px] text-muted-foreground italic truncate max-w-[140px]" title={yf.reason}>
                                        ({yf.reason})
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-normal text-[11px] text-muted-foreground uppercase tracking-wider">
                                    {record.source === 'espro' ? '⚡ ESPRO' : '✍️ Manual'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDialog(record)} aria-label="Edit">
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteTarget(record)}
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </CollapsibleSection>
                  )
                })}

              {groupBy === 'date' &&
                dateGroups.map((day) => {
                  const dayExtStatuses = day.items.map((r) => getExtendedStatusForRecord(r))
                  const present = dayExtStatuses.filter((s) => s === 'present' || s === 'yellow_form' || s === 'blue_form').length
                  const absent = dayExtStatuses.filter((s) => s === 'absent').length
                  return (
                    <CollapsibleSection
                      key={day.date}
                      title={day.date}
                      summary={`${present} Attended · ${absent} Absent`}
                      defaultOpen={true}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow className="hover:bg-transparent border-b/50 text-xs">
                            <TableHead className="w-16">Period</TableHead>
                            <TableHead>Subject</TableHead>
                            <TableHead className="w-48">Status & Form</TableHead>
                            <TableHead className="w-32">Source</TableHead>
                            <TableHead className="w-24 text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {day.items.map((record) => {
                            const extStatus = getExtendedStatusForRecord(record)
                            const yf = getYellowFormForRecord(record)
                            return (
                              <TableRow key={record.id} className="hover:bg-muted/40 transition-colors">
                                <TableCell className="font-medium text-xs">Period {record.period}</TableCell>
                                <TableCell className="font-medium">
                                  {subjectsById.get(record.subjectId)?.name ?? `#${record.subjectId}`}
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center gap-2">
                                    <Select
                                      value={extStatus}
                                      onValueChange={(val) => handleSetStatus(record, val as ExtendedStatus)}
                                    >
                                      <SelectTrigger className={cn(
                                        'h-7 text-xs font-medium w-36',
                                        extStatus === 'present' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
                                        extStatus === 'absent' && 'bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400',
                                        extStatus === 'yellow_form' && 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
                                        extStatus === 'blue_form' && 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400'
                                      )}>
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="present">🟢 Present</SelectItem>
                                        <SelectItem value="absent">🔴 Absent</SelectItem>
                                        <SelectItem value="yellow_form">🟡 Yellow Form</SelectItem>
                                        <SelectItem value="blue_form">🔵 Blue Form</SelectItem>
                                      </SelectContent>
                                    </Select>
                                    {yf?.reason && (
                                      <span className="text-[11px] text-muted-foreground italic truncate max-w-[140px]" title={yf.reason}>
                                        ({yf.reason})
                                      </span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge variant="outline" className="font-normal text-[11px] text-muted-foreground uppercase tracking-wider">
                                    {record.source === 'espro' ? '⚡ ESPRO' : '✍️ Manual'}
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-1">
                                    <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDialog(record)} aria-label="Edit">
                                      <Pencil className="size-3.5" />
                                    </Button>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="size-7 text-destructive hover:text-destructive"
                                      onClick={() => setDeleteTarget(record)}
                                      aria-label="Delete"
                                    >
                                      <Trash2 className="size-3.5" />
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            )
                          })}
                        </TableBody>
                      </Table>
                    </CollapsibleSection>
                  )
                })}

              {groupBy === 'month_day' &&
                monthGroups.map((month) => (
                  <CollapsibleSection
                    key={month.monthKey}
                    title={month.monthLabel}
                    summary={`${month.items.length} class period${month.items.length === 1 ? '' : 's'}`}
                    defaultOpen={true}
                  >
                    <div className="space-y-3 pt-1">
                      {groupByDay(month.items, (r) => r.date).map((day) => {
                        const dayExtStatuses = day.items.map((r) => getExtendedStatusForRecord(r))
                        const present = dayExtStatuses.filter((s) => s === 'present' || s === 'yellow_form' || s === 'blue_form').length
                        const absent = dayExtStatuses.filter((s) => s === 'absent').length

                        return (
                          <CollapsibleSection
                            key={day.date}
                            title={day.date}
                            summary={`${present} Attended · ${absent} Absent`}
                            defaultOpen={true}
                          >
                            <Table>
                              <TableHeader>
                                <TableRow className="hover:bg-transparent border-b/50 text-xs">
                                  <TableHead className="w-16">Period</TableHead>
                                  <TableHead>Subject</TableHead>
                                  <TableHead className="w-48">Status & Form</TableHead>
                                  <TableHead className="w-32">Source</TableHead>
                                  <TableHead className="w-24 text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {day.items.map((record) => {
                                  const extStatus = getExtendedStatusForRecord(record)
                                  const yf = getYellowFormForRecord(record)
                                  return (
                                    <TableRow key={record.id} className="hover:bg-muted/40 transition-colors">
                                      <TableCell className="font-medium text-xs">Period {record.period}</TableCell>
                                      <TableCell className="font-medium">
                                        {subjectsById.get(record.subjectId)?.name ?? `#${record.subjectId}`}
                                      </TableCell>
                                      <TableCell>
                                        <div className="flex items-center gap-2">
                                          <Select
                                            value={extStatus}
                                            onValueChange={(val) => handleSetStatus(record, val as ExtendedStatus)}
                                          >
                                            <SelectTrigger className={cn(
                                              'h-7 text-xs font-medium w-36',
                                              extStatus === 'present' && 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400',
                                              extStatus === 'absent' && 'bg-rose-500/10 text-rose-600 border-rose-500/30 dark:text-rose-400',
                                              extStatus === 'yellow_form' && 'bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400',
                                              extStatus === 'blue_form' && 'bg-blue-500/10 text-blue-600 border-blue-500/30 dark:text-blue-400'
                                            )}>
                                              <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                              <SelectItem value="present">🟢 Present</SelectItem>
                                              <SelectItem value="absent">🔴 Absent</SelectItem>
                                              <SelectItem value="yellow_form">🟡 Yellow Form</SelectItem>
                                              <SelectItem value="blue_form">🔵 Blue Form</SelectItem>
                                            </SelectContent>
                                          </Select>
                                          {yf?.reason && (
                                            <span className="text-[11px] text-muted-foreground italic truncate max-w-[140px]" title={yf.reason}>
                                              ({yf.reason})
                                            </span>
                                          )}
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        <Badge variant="outline" className="font-normal text-[11px] text-muted-foreground uppercase tracking-wider">
                                          {record.source === 'espro' ? '⚡ ESPRO' : '✍️ Manual'}
                                        </Badge>
                                      </TableCell>
                                      <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                          <Button size="icon" variant="ghost" className="size-7" onClick={() => openEditDialog(record)} aria-label="Edit">
                                            <Pencil className="size-3.5" />
                                          </Button>
                                          <Button
                                            size="icon"
                                            variant="ghost"
                                            className="size-7 text-destructive hover:text-destructive"
                                            onClick={() => setDeleteTarget(record)}
                                            aria-label="Delete"
                                          >
                                            <Trash2 className="size-3.5" />
                                          </Button>
                                        </div>
                                      </TableCell>
                                    </TableRow>
                                  )
                                })}
                              </TableBody>
                            </Table>
                          </CollapsibleSection>
                        )
                      })}
                    </div>
                  </CollapsibleSection>
                ))}
            </>
          )}
        </CardContent>
      </Card>

      {/* Expandable ESPRO Trust Check & Audit Section */}
      {esproStatus?.hasCredential && (
        <CollapsibleSection title="ESPRO Comparison & Discrepancy Audit" summary="Official portal totals vs local logs">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Official ESPRO Portal Audit</CardTitle>
              <CardDescription className="text-xs">
                Compare BunkMate Pro's attendance numbers against official university portal totals to identify any period mismatches.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={handleCompareEspro} disabled={esproComparing || esproSyncing || !currentSemester}>
                  {esproComparing ? 'Comparing...' : 'Run Audit Comparison'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSyncEspro}
                  disabled={esproComparing || esproSyncing || !currentSemester}
                >
                  {esproSyncing ? 'Syncing...' : 'Force Full Sync'}
                </Button>
              </div>
              {esproError && <p className="text-sm text-destructive">{esproError}</p>}
              {esproResult && (
                <div className="space-y-4 pt-2">
                  <EsproComparisonTable rows={esproResult.subjects} />
                  <div>
                    <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">Day-by-Day Audit</p>
                    <EsproDayComparisonTable
                      rows={esproResult.days}
                      periodDetails={esproResult.periodDetails}
                      semesterLabel={currentSemester}
                    />
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </CollapsibleSection>
      )}

      {/* Dialogs: Edit / Add Record */}
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
                onValueChange={(v) => setForm({ ...form, status: v as ExtendedStatus })}
              >
                <SelectTrigger id="record-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="present">🟢 Present</SelectItem>
                  <SelectItem value="absent">🔴 Absent</SelectItem>
                  <SelectItem value="yellow_form">🟡 Yellow Form</SelectItem>
                  <SelectItem value="blue_form">🔵 Blue Form</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {(form.status === 'yellow_form' || form.status === 'blue_form' || form.reason) && (
              <div className="space-y-2">
                <Label htmlFor="record-reason">Reason / Note (Optional)</Label>
                <Input
                  id="record-reason"
                  type="text"
                  placeholder={form.status === 'blue_form' ? 'e.g. Sports Fest, Medical' : 'e.g. Hackathon, Cultural Event'}
                  value={form.reason}
                  onChange={(e) => setForm({ ...form, reason: e.target.value })}
                />
              </div>
            )}

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

      {/* Delete Confirmation */}
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

      {/* CSV Import Preview Dialog */}
      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import preview: {importFileName}</DialogTitle>
            <DialogDescription>
              Matched against {currentSemester || 'the active semester'}'s subjects. Nothing is applied until you
              confirm.
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

