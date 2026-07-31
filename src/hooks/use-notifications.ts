import { useMemo } from 'react'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useAttendance } from './use-attendance'
import { buildNotifications, type AppNotification } from '@/lib/notifications'
import { todayIso } from '@/lib/date-utils'

/** Live notifications with muted categories already filtered out. Read/
 * dismissed instance-state is applied separately by the bell (it's view
 * state, and other callers — e.g. any future count — want the muted-filtered
 * list without also hiding dismissed ones). */
export function useNotifications(): AppNotification[] {
  const subjects = useSubjectsStore((s) => s.subjects)
  const overallMinTarget = useSettingsStore((s) => s.overallMinTarget)
  const subjectMinTarget = useSettingsStore((s) => s.subjectMinTarget)
  const atRiskMarginPp = useSettingsStore((s) => s.atRiskMarginPp)
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const mutedCategories = useSettingsStore((s) => s.mutedNotificationCategories)
  const holidays = useHolidaysStore((s) => s.holidays)
  const { bySubject, overall } = useAttendance(currentSemester || null)

  return useMemo(() => {
    const bySubjectOverall = new Map(
      Array.from(bySubject.entries()).map(([subjectId, stats]) => [subjectId, stats.overall]),
    )
    const all = buildNotifications({
      subjects,
      bySubjectOverall,
      overall,
      overallMinTarget,
      subjectMinTarget,
      atRiskMarginPp,
      holidays,
      today: todayIso(),
    })
    const muted = new Set(mutedCategories)
    return all.filter((n) => !muted.has(n.category))
  }, [subjects, bySubject, overall, overallMinTarget, subjectMinTarget, atRiskMarginPp, holidays, mutedCategories])
}
