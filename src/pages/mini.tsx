import { useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { useSettingsStore } from '@/store/settings-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useAttendance } from '@/hooks/use-attendance'
import { jsDayToWeekday } from '@/lib/attendance-engine'
import { NON_ATTENDANCE_TYPES } from '@/lib/period-marking'
import { cn } from '@/lib/utils'

/**
 * The always-on-top companion window's entire UI — deliberately not routed
 * through AppShell (no sidebar, no header): this window exists specifically
 * to NOT be the full app. Same renderer bundle, same stores, just a tiny
 * standalone page at #/mini (see electron/mini-window.ts).
 */
export function MiniPage() {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { slots, load: loadSlots } = useTimetableStore()
  const { overall } = useAttendance(currentSemester || null)

  useEffect(() => {
    loadSubjects({ includeArchived: false })
  }, [loadSubjects])
  useEffect(() => {
    if (currentSemester) loadSlots(currentSemester)
  }, [loadSlots, currentSemester])

  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  const nextClass = useMemo(() => {
    const today = jsDayToWeekday(new Date().toISOString().slice(0, 10))
    if (!today) return null
    const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes()
    const todaySlots = slots
      .filter((s) => s.day === today && !NON_ATTENDANCE_TYPES.includes(s.type) && s.subjectId !== null)
      .sort((a, b) => a.period - b.period)
    for (const slot of todaySlots) {
      if (!slot.startTime) continue
      const [h, m] = slot.startTime.split(':').map(Number)
      if (h * 60 + m >= nowMinutes) {
        return { period: slot.period, subjectName: subjectsById.get(slot.subjectId!)?.name ?? '—', startTime: slot.startTime }
      }
    }
    return null
  }, [slots, subjectsById])

  const percentColor =
    overall.percentage === null
      ? 'text-muted-foreground'
      : overall.percentage < overallMinTarget
        ? 'text-destructive'
        : 'text-success'

  return (
    <div className="flex h-screen select-none flex-col justify-between bg-card p-3" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-muted-foreground">BunkMate</span>
        <button
          type="button"
          onClick={() => window.close()}
          className="text-muted-foreground hover:text-foreground"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          aria-label="Close"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="text-center">
        <p className={cn('text-3xl font-semibold tabular-nums', percentColor)}>
          {overall.percentage !== null ? `${overall.percentage.toFixed(1)}%` : '—'}
        </p>
        <p className="text-[11px] text-muted-foreground">overall attendance</p>
      </div>
      <div className="text-center text-xs">
        {nextClass ? (
          <p>
            Next: <span className="font-medium">{nextClass.subjectName}</span> · P{nextClass.period} ·{' '}
            {nextClass.startTime}
          </p>
        ) : (
          <p className="text-muted-foreground">No more classes today</p>
        )}
      </div>
    </div>
  )
}
