// Pure time-window math for the "schedule" theme option — dark mode between
// a start and end clock time, most commonly wrapping past midnight (e.g.
// 19:00 -> 07:00), which is why this isn't just a plain start <= now < end
// comparison.

function parseHHMM(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!m) return null
  return Number(m[1]) * 60 + Number(m[2])
}

/**
 * Whether dark mode should be active at `nowMinutes` (minutes since
 * midnight), given a start/end window as "HH:MM" strings. When start equals
 * end, there's no window to speak of — stays light. When start > end, the
 * window wraps past midnight (the normal "evening to morning" case).
 */
export function isDarkBySchedule(nowMinutes: number, startHHMM: string, endHHMM: string): boolean {
  const start = parseHHMM(startHHMM)
  const end = parseHHMM(endHHMM)
  if (start === null || end === null || start === end) return false
  if (start < end) return nowMinutes >= start && nowMinutes < end
  return nowMinutes >= start || nowMinutes < end
}
