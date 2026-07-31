import { useMemo } from 'react'
import { WEEKDAYS, type Weekday, type PeriodTime } from '@/db/schema'
import type { TimetableSlot } from '../../electron/db/repositories/timetable-slots'
import type { Subject } from '../../electron/db/repositories/subjects'
import { computeWeekShape } from '@/lib/timetable-week-shape'
import { resolveSubjectColor } from '@/lib/chart-colors'
import { cn } from '@/lib/utils'

const DAY_LABELS: Record<Weekday, string> = {
  mon: 'Mon',
  tue: 'Tue',
  wed: 'Wed',
  thu: 'Thu',
  fri: 'Fri',
  sat: 'Sat',
}

function formatMinutes(totalMinutes: number): string {
  const hours = totalMinutes / 60
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`
}

interface WeekGlanceProps {
  slots: TimetableSlot[]
  periodsPerDay: number
  /** Same map the editable grid uses for its "P1 · 09:00–10:00" vs "Period 1"
   * fallback — passed in rather than recomputed so the two views can never
   * disagree about what a period's time is. */
  periodTimeByPeriod: Map<number, PeriodTime>
  subjects: Subject[]
  onCellClick: (day: Weekday, period: number) => void
}

export function TimetableWeekGlance({
  slots,
  periodsPerDay,
  periodTimeByPeriod,
  subjects,
  onCellClick,
}: WeekGlanceProps) {
  const weekShape = useMemo(
    () => computeWeekShape({ slots, periodTimes: Array.from(periodTimeByPeriod.values()) }),
    [slots, periodTimeByPeriod],
  )

  // A subject's own chosen color if set, else a stable palette slot by id
  // order — matching how Analytics colors subjects.
  const colorBySubjectId = useMemo(() => {
    const sorted = [...subjects].sort((a, b) => a.id - b.id)
    return new Map(sorted.map((s, i) => [s.id, resolveSubjectColor(s.color, i)]))
  }, [subjects])

  const slotAt = useMemo(() => {
    const map = new Map<string, TimetableSlot>()
    for (const slot of slots) map.set(`${slot.day}:${slot.period}`, slot)
    return map
  }, [slots])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])
  const periods = useMemo(() => Array.from({ length: periodsPerDay }, (_, i) => i + 1), [periodsPerDay])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-6 gap-3">
        {WEEKDAYS.map((day) => {
          const shape = weekShape.days.find((d) => d.day === day)!
          const isLightest = weekShape.lightestDay === day
          const isHeaviest = weekShape.heaviestDay === day
          return (
            <div key={day} className="space-y-2 rounded-lg border bg-card p-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">{DAY_LABELS[day]}</span>
                {isLightest && (
                  <span className="rounded bg-success/15 px-1.5 py-0.5 text-[10px] font-semibold text-success">
                    Lightest
                  </span>
                )}
                {isHeaviest && (
                  <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                    Heaviest
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {shape.teachingCount === 0
                  ? 'No classes'
                  : `${shape.teachingCount} period${shape.teachingCount === 1 ? '' : 's'}${
                      shape.totalMinutes !== null ? ` · ${formatMinutes(shape.totalMinutes)}` : ''
                    }`}
              </p>

              <div className="space-y-1">
                {periods.map((period) => {
                  const slot = slotAt.get(`${day}:${period}`)
                  const time = periodTimeByPeriod.get(period)
                  const timeLabel = time ? `${time.startTime}–${time.endTime}` : `Period ${period}`
                  const subjectName = slot?.subjectId ? subjectsById.get(slot.subjectId)?.name : undefined
                  const color = slot?.subjectId ? colorBySubjectId.get(slot.subjectId) : undefined

                  return (
                    <button
                      key={period}
                      type="button"
                      onClick={() => onCellClick(day, period)}
                      title={
                        slot
                          ? `P${period} · ${timeLabel} · ${slot.type}${subjectName ? ` · ${subjectName}` : ''}`
                          : `P${period} · ${timeLabel} · empty`
                      }
                      className={cn(
                        'flex h-4 w-full items-center rounded-sm transition-opacity hover:opacity-80',
                        !slot && 'bg-muted/50',
                        slot?.type === 'lunch' && 'bg-secondary',
                        slot?.type === 'meeting' && 'bg-warning/40',
                      )}
                      style={color ? { backgroundColor: color } : undefined}
                    />
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">
        Each strip is one day, top to bottom by period, colored by subject, grey for lunch/meeting/empty. Click any
        period to open it on the editable grid.
      </p>
    </div>
  )
}
