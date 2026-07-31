// Pure "week shape" summary for the read-only week-at-a-glance view: not a
// smaller copy of the editable grid, but the density the grid doesn't
// prioritize — teaching load per day, and which days are lightest/heaviest.
import { WEEKDAYS, type Weekday } from '@/db/schema'
import { DEFAULT_NON_TEACHING_TYPES } from './timetable-rules'

export interface WeekShapeSlot {
  day: Weekday
  period: number
  type: string
}

export interface WeekShapePeriodTime {
  period: number
  startTime: string
  endTime: string
}

export interface DayShape {
  day: Weekday
  teachingCount: number
  /** Sum of allocated teaching-period durations in minutes. Null when at
   * least one of the day's teaching periods has no allocated time yet — a
   * partial sum would understate the day and read as more misleading than
   * just falling back to the period count. */
  totalMinutes: number | null
  lunchPeriods: number[]
}

export interface WeekShape {
  days: DayShape[]
  /** Null when there's no teaching at all, or every day is tied — a tie
   * isn't a meaningful "lightest day", so it's left uncalled-out rather
   * than arbitrarily picking whichever day was scanned first. */
  lightestDay: Weekday | null
  heaviestDay: Weekday | null
}

function minutesBetween(start: string, end: string): number {
  const [startHour, startMinute] = start.split(':').map(Number)
  const [endHour, endMinute] = end.split(':').map(Number)
  return endHour * 60 + endMinute - (startHour * 60 + startMinute)
}

export function computeWeekShape(params: {
  slots: WeekShapeSlot[]
  periodTimes: WeekShapePeriodTime[]
  nonTeachingTypes?: readonly string[]
}): WeekShape {
  const { slots, periodTimes, nonTeachingTypes = DEFAULT_NON_TEACHING_TYPES } = params
  const timeByPeriod = new Map(periodTimes.map((pt) => [pt.period, pt]))
  const nonTeaching = new Set(nonTeachingTypes)

  const days: DayShape[] = WEEKDAYS.map((day) => {
    const daySlots = slots.filter((s) => s.day === day)
    const teachingSlots = daySlots.filter((s) => !nonTeaching.has(s.type))

    let totalMinutes: number | null = 0
    for (const s of teachingSlots) {
      const time = timeByPeriod.get(s.period)
      if (!time) {
        totalMinutes = null
        break
      }
      totalMinutes += minutesBetween(time.startTime, time.endTime)
    }

    return {
      day,
      teachingCount: teachingSlots.length,
      totalMinutes,
      lunchPeriods: daySlots.filter((s) => s.type === 'lunch').map((s) => s.period),
    }
  })

  const withTeaching = days.filter((d) => d.teachingCount > 0)
  const counts = new Set(withTeaching.map((d) => d.teachingCount))
  const hasVariance = counts.size > 1

  return {
    days,
    lightestDay: hasVariance ? withTeaching.reduce((a, b) => (b.teachingCount < a.teachingCount ? b : a)).day : null,
    heaviestDay: hasVariance ? withTeaching.reduce((a, b) => (b.teachingCount > a.teachingCount ? b : a)).day : null,
  }
}
