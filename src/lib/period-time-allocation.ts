// Pure calculation for "Auto-allocate times" in Grid Settings: evenly splits
// a day's start-end span across every period row (lunch included, weighted
// the same as a teaching period). Kept out of the UI (and out of any DB
// import) so the division/remainder logic has its own tests independent of
// the dialog — mirrors how attendance-engine.ts hand-rolls its own input
// shapes instead of importing DB types.
export interface PeriodTime {
  period: number
  startTime: string
  endTime: string
}

export interface AllocateEvenPeriodTimesParams {
  periodsPerDay: number
  /** "HH:MM", 24-hour. */
  dayStartTime: string
  /** "HH:MM", 24-hour. Must be after dayStartTime. */
  dayEndTime: string
}

function parseTimeToMinutes(time: string): number {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time)
  if (!match) throw new Error(`Invalid time "${time}", expected HH:MM.`)
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) throw new Error(`Invalid time "${time}", expected HH:MM.`)
  return hours * 60 + minutes
}

function formatMinutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Evenly divides [dayStartTime, dayEndTime) across periodsPerDay periods.
 * When the span doesn't divide evenly into whole minutes, every period gets
 * the same floor(span / periodsPerDay) duration EXCEPT the last, which
 * absorbs the remainder — a deliberate choice so the imprecision lands in
 * one place instead of every period's boundary drifting by a rounded minute.
 */
export function allocateEvenPeriodTimes(params: AllocateEvenPeriodTimesParams): PeriodTime[] {
  const { periodsPerDay, dayStartTime, dayEndTime } = params
  if (!Number.isInteger(periodsPerDay) || periodsPerDay < 1) {
    throw new Error(`periodsPerDay must be a positive integer (got ${periodsPerDay}).`)
  }

  const startMinutes = parseTimeToMinutes(dayStartTime)
  const endMinutes = parseTimeToMinutes(dayEndTime)
  const totalMinutes = endMinutes - startMinutes
  if (totalMinutes <= 0) {
    throw new Error(`Day end time (${dayEndTime}) must be after day start time (${dayStartTime}).`)
  }

  const baseDuration = Math.floor(totalMinutes / periodsPerDay)
  if (baseDuration < 1) {
    throw new Error(
      `${dayStartTime}–${dayEndTime} (${totalMinutes} minutes) is too short to split across ${periodsPerDay} periods.`,
    )
  }
  const remainder = totalMinutes % periodsPerDay

  const result: PeriodTime[] = []
  let cursor = startMinutes
  for (let period = 1; period <= periodsPerDay; period++) {
    const isLast = period === periodsPerDay
    const duration = isLast ? baseDuration + remainder : baseDuration
    const periodStart = cursor
    const periodEnd = cursor + duration
    result.push({
      period,
      startTime: formatMinutesToTime(periodStart),
      endTime: formatMinutesToTime(periodEnd),
    })
    cursor = periodEnd
  }
  return result
}
