import { create } from 'zustand'
import {
  type PomodoroPhase,
  type PomodoroConfig,
  DEFAULT_POMODORO_CONFIG,
  phaseDurationSeconds,
  nextPhase,
} from '@/lib/pomodoro'
import { useToastStore } from '@/store/toast-store'

const PHASE_LABEL: Record<PomodoroPhase, string> = {
  work: 'Focus session',
  shortBreak: 'Short break',
  longBreak: 'Long break',
}

interface PomodoroState {
  phase: PomodoroPhase
  secondsRemaining: number
  running: boolean
  completedWorkSessions: number
  config: PomodoroConfig
  start: () => void
  pause: () => void
  reset: () => void
  skip: () => void
}

let intervalId: ReturnType<typeof setInterval> | null = null

function stopInterval() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

// Best-effort: focus mode is a main-process convenience (mutes native
// reminders), not something the timer's own correctness depends on — a
// failed IPC call here shouldn't stop the timer itself from working.
function setFocusMode(active: boolean) {
  window.bunkmate?.focusMode?.set(active).catch(() => {})
}

export const usePomodoroStore = create<PomodoroState>((set, get) => ({
  phase: 'work',
  secondsRemaining: phaseDurationSeconds('work', DEFAULT_POMODORO_CONFIG),
  running: false,
  completedWorkSessions: 0,
  config: DEFAULT_POMODORO_CONFIG,

  start: () => {
    if (get().running) return
    set({ running: true })
    if (get().phase === 'work') setFocusMode(true)
    stopInterval()
    intervalId = setInterval(() => {
      const { secondsRemaining, phase, completedWorkSessions, config } = get()
      if (secondsRemaining > 1) {
        set({ secondsRemaining: secondsRemaining - 1 })
        return
      }
      // Phase complete: advance, and land paused rather than auto-running
      // the next phase — a break shouldn't silently start counting down
      // before the user's actually stepped away, and the next work session
      // shouldn't start before they're back.
      const justCompletedWorkSessions = phase === 'work' ? completedWorkSessions + 1 : completedWorkSessions
      const upcoming = nextPhase(phase, justCompletedWorkSessions, config)
      stopInterval()
      setFocusMode(false)
      set({
        phase: upcoming,
        secondsRemaining: phaseDurationSeconds(upcoming, config),
        running: false,
        completedWorkSessions: justCompletedWorkSessions,
      })
      useToastStore.getState().push({
        title: `${PHASE_LABEL[phase]} done`,
        description: `Next up: ${PHASE_LABEL[upcoming]}.`,
      })
    }, 1000)
  },

  pause: () => {
    stopInterval()
    setFocusMode(false)
    set({ running: false })
  },

  reset: () => {
    stopInterval()
    setFocusMode(false)
    const { phase, config } = get()
    set({ secondsRemaining: phaseDurationSeconds(phase, config), running: false })
  },

  skip: () => {
    const { phase, completedWorkSessions, config } = get()
    const justCompletedWorkSessions = phase === 'work' ? completedWorkSessions + 1 : completedWorkSessions
    const upcoming = nextPhase(phase, justCompletedWorkSessions, config)
    stopInterval()
    setFocusMode(false)
    set({
      phase: upcoming,
      secondsRemaining: phaseDurationSeconds(upcoming, config),
      running: false,
      completedWorkSessions: justCompletedWorkSessions,
    })
  },
}))
