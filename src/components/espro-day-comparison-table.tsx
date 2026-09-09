import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CollapsibleSection } from '@/components/collapsible-section'
import { groupByMonth } from '@/lib/date-utils'
import { friendlyError } from '@/lib/friendly-error'
import { useToastStore } from '@/store/toast-store'
import { summarizeDayComparison, type DayComparisonRow, type DayPeriodDetail } from '../../electron/espro/attendance-days'

/**
 * Day-by-day present/absent check, below the per-subject totals table. A
 * semester's worth of dates is 60-90+ rows — showing them all flat is
 * exactly the wall of scrolling the rest of the app was reorganized to
 * avoid. Grouped by month instead: every month starts collapsed (showing
 * just its name and a one-line summary of what needs attention), and only
 * renders its day rows once actually expanded. A month is auto-expanded
 * only when it's the sole month in view — the common case when the date
 * filter is already scoped to one month — so there's no pointless extra
 * click for the default, already-narrow view.
 */
export function EsproDayComparisonTable({
  rows,
  periodDetails,
  semesterLabel,
}: {
  rows: DayComparisonRow[]
  periodDetails: DayPeriodDetail[]
  semesterLabel: string
}) {
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  // Seeded from the pre-fetched mismatches compareAttendance already
  // bundled, then grown on demand as the user clicks other days — every day
  // is clickable (not just mismatches), but only the ones actually opened
  // ever cost a request.
  const [detailByDate, setDetailByDate] = useState<Map<string, DayPeriodDetail>>(
    () => new Map(periodDetails.map((d) => [d.date, d])),
  )
  const [loadingDate, setLoadingDate] = useState<string | null>(null)
  const pushToast = useToastStore((s) => s.push)

  const overallSummary = useMemo(() => summarizeDayComparison(rows), [rows])
  const monthGroups = useMemo(() => groupByMonth(rows, (r) => r.date), [rows])

  // A fresh compare/sync result invalidates whatever was fetched for the
  // previous one — don't leave a dialog open, or a cache entry, referencing
  // stale data.
  useEffect(() => {
    setSelectedDate(null)
    setDetailByDate(new Map(periodDetails.map((d) => [d.date, d])))
  }, [rows, periodDetails])

  async function openDate(date: string) {
    setSelectedDate(date)
    if (detailByDate.has(date)) return
    setLoadingDate(date)
    try {
      const detail = await window.bunkmate.espro.getDayPeriodDetail(semesterLabel, date)
      setDetailByDate((prev) => new Map(prev).set(date, detail))
    } catch (error) {
      const fe = friendlyError(error, "Couldn't load that day's periods")
      pushToast({ title: "Couldn't load that day's periods", description: fe.message, detail: fe.detail })
      setSelectedDate(null)
    } finally {
      setLoadingDate(null)
    }
  }

  if (rows.length === 0) {
    return <p className="py-4 text-center text-sm text-muted-foreground">No days to compare.</p>
  }

  const needingAttention = overallSummary.mismatch + overallSummary.esproOnly + overallSummary.localOnly

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        {needingAttention === 0
          ? `All ${overallSummary.total} days match.`
          : `${overallSummary.total} days · ${overallSummary.mismatch} mismatch · ${overallSummary.esproOnly} ESPRO only · ${overallSummary.localOnly} local only · ${overallSummary.match} matched`}
      </p>

      <div className="space-y-2">
        {monthGroups.map((month) => {
          const monthSummary = summarizeDayComparison(month.items)
          const monthNeedsAttention = monthSummary.mismatch + monthSummary.esproOnly + monthSummary.localOnly
          return (
            <CollapsibleSection
              key={month.monthKey}
              title={month.monthLabel}
              summary={monthNeedsAttention === 0 ? `${monthSummary.total} matched` : `${monthNeedsAttention} need attention`}
              defaultOpen={monthGroups.length === 1}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>ESPRO</TableHead>
                    <TableHead>BunkMate</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {month.items.map((row) => {
                    const statusVariant =
                      row.status === 'match' ? 'success' : row.status === 'mismatch' ? 'warning' : 'outline'
                    const statusLabel =
                      row.status === 'match'
                        ? 'Match'
                        : row.status === 'mismatch'
                          ? 'Mismatch'
                          : row.status === 'espro-only'
                            ? 'ESPRO only'
                            : 'Local only'
                    return (
                      <TableRow key={row.date}>
                        <TableCell className="text-xs font-medium">{row.date}</TableCell>
                        <TableCell className="text-xs" title={row.espro ? `${row.espro.present} present / ${row.espro.absent} absent` : undefined}>
                          {row.espro ? `${row.espro.present}P / ${row.espro.absent}A` : '—'}
                        </TableCell>
                        <TableCell className="text-xs" title={row.local ? `${row.local.present} present / ${row.local.absent} absent` : undefined}>
                          {row.local ? `${row.local.present}P / ${row.local.absent}A` : '—'}
                        </TableCell>
                        <TableCell className="px-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-xs"
                            onClick={() => openDate(row.date)}
                            disabled={loadingDate === row.date}
                            title="See which periods ESPRO and BunkMate each have, hour by hour"
                          >
                            <Badge variant={statusVariant}>{statusLabel}</Badge>
                            {loadingDate === row.date ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <ChevronRight className="size-3" />
                            )}
                          </Button>
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

      <Dialog open={selectedDate !== null} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{selectedDate}</DialogTitle>
          </DialogHeader>
          {selectedDate && loadingDate === selectedDate && (
            <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Fetching that day's periods from ESPRO…
            </p>
          )}
          {selectedDate && detailByDate.get(selectedDate) && <DayPeriodDrilldown detail={detailByDate.get(selectedDate)!} />}
        </DialogContent>
      </Dialog>
    </div>
  )
}

/**
 * Raw period lists for one date, ESPRO's and BunkMate's shown separately
 * rather than joined into one row-per-period table — see the DayPeriodDetail
 * doc comment in attendance-days.ts for why forcing a per-period match would
 * be dishonest here.
 */
function DayPeriodDrilldown({ detail }: { detail: DayPeriodDetail }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">ESPRO periods</p>
        {detail.espro.length === 0 ? (
          <p className="text-xs text-muted-foreground">No period data returned.</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {detail.espro.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {p.periodStartTime}–{p.periodEndTime} · {p.courseName}
                </span>
                <Badge variant={p.isPresent ? 'success' : 'warning'} className="shrink-0">
                  {p.isPresent ? 'P' : 'A'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <p className="mb-1 text-[11px] font-medium text-muted-foreground uppercase">BunkMate periods</p>
        {detail.local.length === 0 ? (
          <p className="text-xs text-muted-foreground">No local records for this date.</p>
        ) : (
          <ul className="space-y-0.5 text-xs">
            {detail.local.map((p, i) => (
              <li key={i} className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {p.startTime && p.endTime ? `${p.startTime}–${p.endTime}` : `Period ${p.period}`} · {p.subjectName}
                </span>
                <Badge variant={p.status === 'present' ? 'success' : 'warning'} className="shrink-0">
                  {p.status === 'present' ? 'P' : 'A'}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
