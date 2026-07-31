import { create } from 'zustand'
import { persist } from 'zustand/middleware'

// Read/dismissed state for individual notifications. Notifications are derived
// live (buildNotifications) and regenerate every render, so this is genuinely
// ephemeral VIEW state, not domain data — hence localStorage, not the DB.
//
// Both sets are keyed by a per-notification SIGNATURE (`${id}|${description}`)
// rather than the bare id. The description embeds the current value ("60.0%
// attended…"), so when the underlying situation changes the signature changes
// too: a dismissed "close to target" alert reappears once the number moves,
// and a read one re-bolds — you're told again when something actually changed,
// but not nagged about the identical unchanged state.
interface NotificationStateStore {
  readSignatures: string[]
  dismissedSignatures: string[]
  markRead: (signature: string) => void
  markUnread: (signature: string) => void
  markAllRead: (signatures: string[]) => void
  dismiss: (signature: string) => void
  dismissAll: (signatures: string[]) => void
  /** Drop stored signatures no longer present, so the two sets can't grow
   * without bound as attendance numbers churn. Called by the bell each render
   * with the currently-live signatures. */
  prune: (liveSignatures: string[]) => void
}

export function notificationSignature(id: string, description: string): string {
  return `${id}|${description}`
}

export const useNotificationStateStore = create<NotificationStateStore>()(
  persist(
    (set) => ({
      readSignatures: [],
      dismissedSignatures: [],
      markRead: (signature) =>
        set((s) => ({ readSignatures: [...new Set([...s.readSignatures, signature])] })),
      markUnread: (signature) =>
        set((s) => ({ readSignatures: s.readSignatures.filter((x) => x !== signature) })),
      markAllRead: (signatures) =>
        set((s) => ({ readSignatures: [...new Set([...s.readSignatures, ...signatures])] })),
      dismiss: (signature) =>
        set((s) => ({ dismissedSignatures: [...new Set([...s.dismissedSignatures, signature])] })),
      dismissAll: (signatures) =>
        set((s) => ({ dismissedSignatures: [...new Set([...s.dismissedSignatures, ...signatures])] })),
      prune: (liveSignatures) =>
        set((s) => {
          const live = new Set(liveSignatures)
          const read = s.readSignatures.filter((x) => live.has(x))
          const dismissed = s.dismissedSignatures.filter((x) => live.has(x))
          // Only replace arrays whose membership actually shrank, so prune()
          // in a render effect can't loop by handing back new references.
          const readChanged = read.length !== s.readSignatures.length
          const dismissedChanged = dismissed.length !== s.dismissedSignatures.length
          if (!readChanged && !dismissedChanged) return {}
          return {
            ...(readChanged ? { readSignatures: read } : {}),
            ...(dismissedChanged ? { dismissedSignatures: dismissed } : {}),
          }
        }),
    }),
    { name: 'bunkmate-notification-state' },
  ),
)
