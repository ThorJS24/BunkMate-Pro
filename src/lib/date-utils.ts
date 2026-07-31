/**
 * The user's current local calendar date as a plain yyyy-mm-dd string.
 * Deliberately NOT `new Date().toISOString().slice(0, 10)` — that reports
 * the UTC calendar date, which is a day ahead of local for anyone west of
 * Greenwich... no, east of it (UTC+ offsets) near midnight, e.g. 11:36pm in
 * India already reads as tomorrow in UTC. Attendance dates are entered and
 * stored as local calendar dates with no time-of-day, so "today" needs to
 * match that same convention.
 */
export function todayIso(): string {
  const d = new Date()
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * The calendar day after `dateIso` (yyyy-mm-dd), as a plain date string.
 * UTC-anchored so it never shifts by a timezone offset — matches how dates
 * are stored everywhere (plain date, no time-of-day).
 */
export function nextDayIso(dateIso: string): string {
  const d = new Date(`${dateIso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

/**
 * Whole calendar days from today until `dateIso` (UTC-anchored, matching how
 * dates are stored). 0 = today, positive = future, negative = past.
 */
export function daysUntil(dateIso: string): number {
  const target = new Date(`${dateIso}T00:00:00Z`).getTime()
  const today = new Date(`${todayIso()}T00:00:00Z`).getTime()
  return Math.round((target - today) / (24 * 60 * 60 * 1000))
}

/** Human "in N days" / "today" / "tomorrow" / "N days ago" for a countdown. */
export function countdownLabel(dateIso: string): string {
  const d = daysUntil(dateIso)
  if (d === 0) return 'Today'
  if (d === 1) return 'Tomorrow'
  if (d === -1) return 'Yesterday'
  if (d > 0) return `in ${d} days`
  return `${-d} days ago`
}
