// Pure state machine for a Pomodoro-style timer: work/break phases,
// configurable lengths, no wall-clock/timer wiring here (that's the
// component's job, this just says what phase comes next and how long it
// runs) — same split as the rest of the app's pure-logic modules.

export type PomodoroPhase = 'work' | 'shortBreak' | 'longBreak'

export interface PomodoroConfig {
  workMinutes: number
  shortBreakMinutes: number
  longBreakMinutes: number
  /** How many work sessions before a long break instead of a short one. */
  sessionsUntilLongBreak: number
}

export const DEFAULT_POMODORO_CONFIG: PomodoroConfig = {
  workMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  sessionsUntilLongBreak: 4,
}

export function phaseDurationSeconds(phase: PomodoroPhase, config: PomodoroConfig): number {
  const minutes =
    phase === 'work' ? config.workMinutes : phase === 'shortBreak' ? config.shortBreakMinutes : config.longBreakMinutes
  return minutes * 60
}

/** The phase after `completedPhase`'s `completedWorkSessions`-th completion (work sessions counted so far, including this one if completedPhase is 'work'). */
export function nextPhase(completedPhase: PomodoroPhase, completedWorkSessions: number, config: PomodoroConfig): PomodoroPhase {
  if (completedPhase !== 'work') return 'work'
  return completedWorkSessions % config.sessionsUntilLongBreak === 0 ? 'longBreak' : 'shortBreak'
}

export function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
  const s = totalSeconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
