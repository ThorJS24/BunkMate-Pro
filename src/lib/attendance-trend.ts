import {
  computeAttendance,
  aggregateOverall,
  jsDayToWeekday,
  type ComputeAttendanceParams,
  type BucketStats,
  type Weekday,
} from './attendance-engine'

export type TrendGranularity = 'week' | 'month'

export interface TrendPoint {
  /** Week start (Monday, ISO date) or month (yyyy-mm), depending on granularity. */
  bucket: string
  percentage: number | null
  total: number
  attended: number
}

function bucketKeyForDate(date: string, granularity: TrendGranularity): string {
  if (granularity === 'month') return date.slice(0, 7)
  const d = new Date(`${date}T00:00:00Z`)
  const day = d.getUTCDay()
  const diffToMonday = day === 0 ? -6 : 1 - day
  d.setUTCDate(d.getUTCDate() + diffToMonday)
  return d.toISOString().slice(0, 10)
}

/**
 * Buckets attendance into a cumulative trend line: each point is the overall
 * percentage computed from every record up to and including that bucket's
 * last date. Reuses computeAttendance() at each cutoff rather than
 * reimplementing the bucket-resolution rules, so the trend can never drift
 * from what the dashboard/analytics summary shows for the same data.
 */
export function computeAttendanceTrend(
  params: ComputeAttendanceParams & { granularity: TrendGranularity },
): TrendPoint[] {
  const { records, granularity, slots, holidays, yellowForms, rules } = params

  const cutoffByBucket = new Map<string, string>()
  for (const date of new Set(records.map((r) => r.date))) {
    const key = bucketKeyForDate(date, granularity)
    const existing = cutoffByBucket.get(key)
    if (!existing || date > existing) cutoffByBucket.set(key, date)
  }

  return Array.from(cutoffByBucket.keys())
    .sort()
    .map((bucket) => {
      const cutoff = cutoffByBucket.get(bucket)!
      const recordsUpToCutoff = records.filter((r) => r.date <= cutoff)
      const overall = aggregateOverall(
        computeAttendance({ records: recordsUpToCutoff, slots, holidays, yellowForms, rules }),
      )
      return { bucket, percentage: overall.percentage, total: overall.total, attended: overall.attended }
    })
}

/**
 * Per-day (not cumulative) overall stats — each date's own attended/total,
 * still resolved through the same bucket/holiday rules. Used for the
 * calendar heatmap.
 */
export function computeDailyAttendance(params: ComputeAttendanceParams): Map<string, BucketStats> {
  const { records, slots, holidays, yellowForms, rules } = params

  const recordsByDate = new Map<string, typeof records>()
  for (const r of records) {
    const list = recordsByDate.get(r.date)
    if (list) list.push(r)
    else recordsByDate.set(r.date, [r])
  }

  const result = new Map<string, BucketStats>()
  for (const [date, dayRecords] of recordsByDate) {
    const overall = aggregateOverall(
      computeAttendance({ records: dayRecords, slots, holidays, yellowForms, rules }),
    )
    result.set(date, overall)
  }
  return result
}

export interface WeekdayAttendance {
  day: Weekday
  stats: BucketStats
}

const WEEKDAY_ORDER: Weekday[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat']

/**
 * Attendance grouped by day-of-week (Mon-Sat, matching the timetable's own
 * model) rather than by date — "which day do I actually skip" instead of
 * "how am I doing over time". Always returns all six days in order, even
 * ones with zero records, so the caller doesn't need to backfill gaps.
 */
export function computeWeekdayAttendance(params: ComputeAttendanceParams): WeekdayAttendance[] {
  const { records, slots, holidays, yellowForms, rules } = params

  const recordsByWeekday = new Map<Weekday, typeof records>()
  for (const r of records) {
    const day = jsDayToWeekday(r.date)
    if (!day) continue
    const list = recordsByWeekday.get(day)
    if (list) list.push(r)
    else recordsByWeekday.set(day, [r])
  }

  return WEEKDAY_ORDER.map((day) => ({
    day,
    stats: aggregateOverall(
      computeAttendance({ records: recordsByWeekday.get(day) ?? [], slots, holidays, yellowForms, rules }),
    ),
  }))
}
