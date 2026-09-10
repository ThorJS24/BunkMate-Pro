import { useEsproSyncStore } from '@/store/espro-sync-store'
import { Progress } from '@/components/ui/progress'
import { RefreshCw, CheckCircle2, AlertCircle, Database } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EsproProgressBarProps {
  className?: string
  compact?: boolean
}

export function EsproProgressBar({ className, compact = false }: EsproProgressBarProps) {
  const progress = useEsproSyncStore((s) => s.progress)
  const isSyncing = useEsproSyncStore((s) => s.isSyncing)

  if (!isSyncing || !progress) return null

  const isDone = progress.stage === 'done'
  const isError = progress.stage === 'error'

  return (
    <div
      className={cn(
        'rounded-lg border bg-card p-3.5 shadow-sm transition-all animate-in fade-in slide-in-from-top-1',
        isError ? 'border-destructive/40 bg-destructive/5' : 'border-primary/20 bg-primary/5',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {isDone ? (
            <CheckCircle2 className="size-4 text-emerald-500 shrink-0" />
          ) : isError ? (
            <AlertCircle className="size-4 text-destructive shrink-0" />
          ) : progress.stage === 'discovering_courses' || progress.stage === 'creating_subjects' ? (
            <Database className="size-4 text-primary animate-pulse shrink-0" />
          ) : (
            <RefreshCw className="size-4 text-primary animate-spin shrink-0" />
          )}
          <span className="text-xs font-semibold truncate text-foreground">
            {progress.message || 'Syncing with ESPRO...'}
          </span>
        </div>
        <span className="text-xs font-mono font-medium text-muted-foreground shrink-0">
          {Math.round(progress.percentage)}%
        </span>
      </div>

      <Progress
        value={progress.percentage}
        className="h-2 bg-muted/60"
        indicatorClassName={cn(
          'transition-all duration-300',
          isDone ? 'bg-emerald-500' : isError ? 'bg-destructive' : 'bg-primary',
        )}
      />

      {!compact && progress.current !== undefined && progress.total !== undefined && (
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
          <span>
            Processing record {progress.current} of {progress.total}
          </span>
          <span>{progress.total - progress.current} remaining</span>
        </div>
      )}
    </div>
  )
}
