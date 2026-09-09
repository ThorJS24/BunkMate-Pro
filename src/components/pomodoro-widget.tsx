import { Timer, Play, Pause, RotateCcw, SkipForward } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { usePomodoroStore } from '@/store/pomodoro-store'
import { formatSeconds, phaseDurationSeconds } from '@/lib/pomodoro'
import { cn } from '@/lib/utils'

const PHASE_LABEL = { work: 'Focus', shortBreak: 'Short break', longBreak: 'Long break' } as const

/**
 * A quiet corner widget, not a page — a study timer only earns its keep if
 * it survives navigating around the app, so it's mounted once at the app
 * shell (like the toaster) and reads from a store, not page-local state.
 */
export function PomodoroWidget() {
  const { phase, secondsRemaining, running, config, start, pause, reset, skip } = usePomodoroStore()
  const total = phaseDurationSeconds(phase, config)
  const progress = total > 0 ? 1 - secondsRemaining / total : 0
  const isIdle = !running && secondsRemaining === total

  return (
    <div className="fixed bottom-4 left-4 z-40">
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex items-center gap-2 rounded-full border bg-card px-3 py-2 text-sm shadow-lg transition-colors hover:bg-accent',
              phase === 'work' && running && 'border-primary/50',
            )}
            title="Study timer"
          >
            <Timer className={cn('size-4', running && 'text-primary')} />
            {!isIdle && <span className="tabular-nums">{formatSeconds(secondsRemaining)}</span>}
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" className="w-56">
          <div className="space-y-3 text-center">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{PHASE_LABEL[phase]}</p>
            <p className="text-3xl font-semibold tabular-nums">{formatSeconds(secondsRemaining)}</p>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex justify-center gap-1.5">
              {running ? (
                <Button size="sm" variant="outline" onClick={pause}>
                  <Pause /> Pause
                </Button>
              ) : (
                <Button size="sm" onClick={start}>
                  <Play /> {isIdle ? 'Start' : 'Resume'}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={reset} title="Reset this phase">
                <RotateCcw />
              </Button>
              <Button size="sm" variant="outline" onClick={skip} title="Skip to next phase">
                <SkipForward />
              </Button>
            </div>
            {phase === 'work' && running && (
              <p className="text-[11px] text-muted-foreground">Class/exam reminders are paused while you focus.</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
