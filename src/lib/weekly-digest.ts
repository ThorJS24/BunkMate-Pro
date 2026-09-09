// Pure "is the weekly digest due right now" calculation, same shape as
// class-reminders.ts / exam-reminders.ts. Fires once, Sunday evening — a
// quick "how'd this week go, what's coming" native notification, not
// something that needs the app open to see (unlike the in-app bell in
// notifications.ts, which only shows live while BunkMate is running).

export const WEEKLY_DIGEST_HOUR = 18
/** JS Date#getDay() value for Sunday. */
export const WEEKLY_DIGEST_WEEKDAY = 0

export interface WeeklyDigestInput {
  overallPercentage: number | null
  subjectsBelowTarget: number
  examCountNextWeek: number
}

export interface DueWeeklyDigest {
  /** Keyed by date, not week number — simpler, and a date only ever falls on one Sunday. */
  key: string
  title: string
  body: string
}

export function computeDueWeeklyDigest(params: {
  todayIso: string
  jsWeekday: number
  nowMinutes: number
  digest: WeeklyDigestInput
}): DueWeeklyDigest | null {
  const { todayIso, jsWeekday, nowMinutes, digest } = params
  if (jsWeekday !== WEEKLY_DIGEST_WEEKDAY) return null
  if (nowMinutes < WEEKLY_DIGEST_HOUR * 60) return null

  const parts: string[] = [
    digest.overallPercentage !== null ? `Overall: ${digest.overallPercentage.toFixed(1)}%` : 'No attendance recorded yet',
  ]
  if (digest.subjectsBelowTarget > 0) {
    parts.push(`${digest.subjectsBelowTarget} subject${digest.subjectsBelowTarget === 1 ? '' : 's'} below target`)
  }
  if (digest.examCountNextWeek > 0) {
    parts.push(`${digest.examCountNextWeek} exam${digest.examCountNextWeek === 1 ? '' : 's'} next week`)
  }

  return {
    key: `weekly-digest:${todayIso}`,
    title: 'Your week in BunkMate',
    body: parts.join(' · '),
  }
}
