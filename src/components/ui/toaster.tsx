import { useToastStore } from '@/store/toast-store'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { XIcon } from 'lucide-react'

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts)
  const dismiss = useToastStore((s) => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className="fixed right-4 bottom-4 z-100 flex w-full max-w-sm flex-col gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={cn(
            'flex items-start gap-3 rounded-lg border bg-card p-4 text-card-foreground shadow-lg',
            toast.variant === 'destructive' && 'border-destructive/50 bg-destructive text-destructive-foreground',
          )}
        >
          <div className="flex-1 space-y-1">
            <p className="text-sm font-medium">{toast.title}</p>
            {toast.description && <p className="text-sm opacity-90">{toast.description}</p>}
            {toast.action && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  toast.action?.onClick()
                  dismiss(toast.id)
                }}
              >
                {toast.action.label}
              </Button>
            )}
          </div>
          <button
            onClick={() => dismiss(toast.id)}
            className="shrink-0 opacity-70 transition-opacity hover:opacity-100"
            aria-label="Dismiss"
          >
            <XIcon className="size-4" />
          </button>
        </div>
      ))}
    </div>
  )
}
