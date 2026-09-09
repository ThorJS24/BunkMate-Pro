import { Award } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { Achievement } from '@/lib/achievements'

/** A quiet, passive strip — no popups, nothing to dismiss. Earning one is a side effect of using the app, not a goal to chase. */
export function AchievementsStrip({ achievements }: { achievements: Achievement[] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {achievements.map((a) => (
        <Tooltip key={a.id}>
          <TooltipTrigger asChild>
            <span
              className={cn(
                'flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
                a.earned ? 'border-primary/40 bg-accent text-accent-foreground' : 'border-dashed text-muted-foreground/50',
              )}
            >
              <Award className="size-3" />
              {a.label}
            </span>
          </TooltipTrigger>
          <TooltipContent>{a.description}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}
