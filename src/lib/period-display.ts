/**
 * Formats period numbers for display across the application.
 * When a period matches lunchPeriod, it is rendered as '🍱 Lunch Break'
 * without taking up a teaching period number.
 * Subsequent periods (period > lunchPeriod) are renumbered (e.g. Period 6 becomes Period 5).
 */
export function getPeriodDisplayLabel(period: number, lunchPeriod?: number | null): string {
  if (lunchPeriod && period === lunchPeriod) {
    return '🍱 Lunch Break'
  }
  if (lunchPeriod && period > lunchPeriod) {
    return `Period ${period - 1}`
  }
  return `Period ${period}`
}

export function getShortPeriodDisplayLabel(period: number, lunchPeriod?: number | null): string {
  if (lunchPeriod && period === lunchPeriod) {
    return 'Lunch'
  }
  if (lunchPeriod && period > lunchPeriod) {
    return `P${period - 1}`
  }
  return `P${period}`
}
