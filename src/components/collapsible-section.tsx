import { useState, type ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Generic collapsed-by-default section: a clickable header (title + optional
 * summary) that reveals its children on click. The building block for the
 * month/day grouping on the Attendance page — a long flat list becomes a
 * short list of collapsed headers, each only rendering its contents once
 * actually expanded, so no default view scrolls through a whole semester's
 * worth of rows.
 */
export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: {
  title: ReactNode
  summary?: ReactNode
  defaultOpen?: boolean
  children: ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="rounded-md border">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 p-2 text-left text-sm hover:bg-accent/50"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronRight className={cn('size-3.5 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} />
          <span className="truncate font-medium">{title}</span>
        </span>
        {summary && <span className="shrink-0 text-xs text-muted-foreground">{summary}</span>}
      </button>
      {open && <div className="border-t p-2">{children}</div>}
    </div>
  )
}
