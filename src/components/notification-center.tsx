import { useEffect, useMemo } from 'react'
import { Bell, AlertTriangle, Info, TriangleAlert, Check, X, Undo2 } from 'lucide-react'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { Button } from '@/components/ui/button'
import { useNotifications } from '@/hooks/use-notifications'
import { useSubjectsStore } from '@/store/subjects-store'
import { useHolidaysStore } from '@/store/holidays-store'
import { useNotificationStateStore, notificationSignature } from '@/store/notification-state-store'
import { cn } from '@/lib/utils'

const SEVERITY_ICON = { critical: AlertTriangle, warning: TriangleAlert, info: Info } as const
const SEVERITY_CLASS = {
  critical: 'text-destructive',
  warning: 'text-warning',
  info: 'text-muted-foreground',
} as const

export function NotificationCenter() {
  const loadSubjects = useSubjectsStore((s) => s.load)
  const loadHolidays = useHolidaysStore((s) => s.load)
  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadHolidays()
  }, [loadSubjects, loadHolidays])

  const notifications = useNotifications()
  const { readSignatures, dismissedSignatures, markRead, markUnread, markAllRead, dismiss, dismissAll, prune } =
    useNotificationStateStore()

  // Attach each notification's signature + read/dismissed flags once, so the
  // render and the actions below agree on exactly the same keys.
  const decorated = useMemo(() => {
    const read = new Set(readSignatures)
    const dismissed = new Set(dismissedSignatures)
    return notifications.map((n) => {
      const signature = notificationSignature(n.id, n.description)
      return { ...n, signature, isRead: read.has(signature), isDismissed: dismissed.has(signature) }
    })
  }, [notifications, readSignatures, dismissedSignatures])

  // Keep the persisted sets from growing without bound as values churn.
  useEffect(() => {
    prune(decorated.map((n) => n.signature))
  }, [decorated, prune])

  const visible = decorated.filter((n) => !n.isDismissed)
  const unreadCount = visible.filter((n) => !n.isRead).length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Notifications" className="relative">
          <Bell />
          {unreadCount > 0 && (
            <span
              className={cn(
                'absolute top-1 right-1 flex size-4 items-center justify-center rounded-full text-[10px] font-medium text-white',
                visible.some((n) => !n.isRead && n.severity === 'critical') ? 'bg-destructive' : 'bg-warning',
              )}
            >
              {unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-96">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold">
            Notifications{unreadCount > 0 && <span className="text-muted-foreground"> · {unreadCount} unread</span>}
          </p>
          {visible.length > 0 && (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                disabled={unreadCount === 0}
                onClick={() => markAllRead(visible.map((n) => n.signature))}
              >
                Mark all read
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={() => dismissAll(visible.map((n) => n.signature))}
              >
                Clear all
              </Button>
            </div>
          )}
        </div>

        {visible.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">You're all caught up.</p>
        ) : (
          <div className="max-h-96 space-y-1 overflow-y-auto">
            {visible.map((n) => {
              const Icon = SEVERITY_ICON[n.severity]
              return (
                <div
                  key={n.id}
                  className={cn(
                    'group flex gap-2 rounded-md p-2',
                    !n.isRead && 'bg-accent/40',
                  )}
                >
                  <Icon className={cn('mt-0.5 size-4 shrink-0', SEVERITY_CLASS[n.severity])} />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-sm', !n.isRead ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                    <p className="text-xs text-muted-foreground">{n.description}</p>
                  </div>
                  <div className="flex shrink-0 items-start gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      title={n.isRead ? 'Mark unread' : 'Mark read'}
                      aria-label={n.isRead ? 'Mark unread' : 'Mark read'}
                      onClick={() => (n.isRead ? markUnread(n.signature) : markRead(n.signature))}
                    >
                      {n.isRead ? <Undo2 className="size-3.5" /> : <Check className="size-3.5" />}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-6"
                      title="Dismiss"
                      aria-label="Dismiss"
                      onClick={() => dismiss(n.signature)}
                    >
                      <X className="size-3.5" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
        <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
          Mute categories in <span className="font-medium">Settings → Notifications</span>.
        </p>
      </PopoverContent>
    </Popover>
  )
}
