// Pure notification-building logic, extracted from the use-notifications
// hook so the "which target applies where" wiring is unit-testable without
// a DOM/React test environment — the hook itself is just a thin adapter
// that gathers store data and calls buildNotifications().
import { computeSafeBunkCount, resolveSubjectMinTarget, type BucketStats } from './attendance-engine'

export type NotificationSeverity = 'critical' | 'warning' | 'info'

// Coarse grouping used for muting: a user can silence a whole category (e.g.
// "stop the at-risk warnings") without losing the others. Every notification
// carries exactly one.
export type NotificationCategory =
  | 'overall-below'
  | 'subject-below'
  | 'subject-at-risk'
  | 'safe-bunk'
  | 'holiday'

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  'overall-below': 'Overall below target',
  'subject-below': 'Subject below target',
  'subject-at-risk': 'Subject close to target',
  'safe-bunk': 'No safe bunks left',
  holiday: 'Upcoming holidays',
}

export interface AppNotification {
  id: string
  category: NotificationCategory
  severity: NotificationSeverity
  title: string
  description: string
}

export interface NotificationSubjectInput {
  id: number
  name: string
  customMinTarget: number | null
}

export interface NotificationHolidayInput {
  id: number
  date: string
  label: string | null
  type: string
}

const DEFAULT_AT_RISK_MARGIN_PP = 5
const UPCOMING_HOLIDAY_WINDOW_DAYS = 14

export interface BuildNotificationsParams {
  subjects: NotificationSubjectInput[]
  bySubjectOverall: Map<number, BucketStats>
  overall: BucketStats
  overallMinTarget: number
  subjectMinTarget: number
  /** Points above target still flagged "close to target". Defaults to 5;
   * 0 disables the at-risk band. */
  atRiskMarginPp?: number
  holidays: NotificationHolidayInput[]
  today: string
}

export function buildNotifications(params: BuildNotificationsParams): AppNotification[] {
  const { subjects, bySubjectOverall, overall, overallMinTarget, subjectMinTarget, holidays, today } = params
  const atRiskMarginPp = params.atRiskMarginPp ?? DEFAULT_AT_RISK_MARGIN_PP
  const notifications: AppNotification[] = []

  if (overall.percentage !== null && overall.percentage < overallMinTarget) {
    notifications.push({
      id: 'overall-below-target',
      category: 'overall-below',
      severity: 'critical',
      title: 'Overall attendance is below target',
      description: `${overall.percentage.toFixed(1)}% attended, target is ${overallMinTarget}%.`,
    })
  }

  for (const subject of subjects) {
    const stats = bySubjectOverall.get(subject.id)
    if (!stats || stats.percentage === null) continue
    const target = resolveSubjectMinTarget(subject, subjectMinTarget)

    if (stats.percentage < target) {
      notifications.push({
        id: `below-target-${subject.id}`,
        category: 'subject-below',
        severity: 'critical',
        title: `${subject.name} is below target`,
        description: `${stats.percentage.toFixed(1)}% attended, target is ${target}%.`,
      })
    } else if (atRiskMarginPp > 0 && stats.percentage < target + atRiskMarginPp) {
      notifications.push({
        id: `at-risk-${subject.id}`,
        category: 'subject-at-risk',
        severity: 'warning',
        title: `${subject.name} is close to the target`,
        description: `${stats.percentage.toFixed(1)}% attended, within ${atRiskMarginPp} points of ${target}%.`,
      })
    }

    const safeBunks = computeSafeBunkCount(stats.attended, stats.total, target)
    if (safeBunks === 0 && stats.percentage >= target) {
      notifications.push({
        id: `safe-bunk-zero-${subject.id}`,
        category: 'safe-bunk',
        severity: 'warning',
        title: `${subject.name} has no safe bunks left`,
        description: 'Missing the next class would drop you below target.',
      })
    }
  }

  for (const holiday of holidays) {
    if (holiday.date < today) continue
    const daysAway = Math.round(
      (new Date(`${holiday.date}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
        (24 * 60 * 60 * 1000),
    )
    if (daysAway <= UPCOMING_HOLIDAY_WINDOW_DAYS) {
      notifications.push({
        id: `holiday-${holiday.id}`,
        category: 'holiday',
        severity: 'info',
        title: holiday.label ?? 'Upcoming holiday',
        description: daysAway === 0 ? 'Today' : `In ${daysAway} day${daysAway === 1 ? '' : 's'} (${holiday.date})`,
      })
    }
  }

  const severityRank: Record<NotificationSeverity, number> = { critical: 0, warning: 1, info: 2 }
  return notifications.sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
}
