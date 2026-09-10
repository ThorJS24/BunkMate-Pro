import { useState, useEffect } from 'react'
import { useSettingsStore } from '@/store/settings-store'

export function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine)
  const currentSemester = useSettingsStore((s) => s.currentSemester)

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true)
      try {
        if (window.bunkmate?.espro?.getStatus) {
          const status = await window.bunkmate.espro.getStatus()
          if (status?.hasCredential && currentSemester) {
            console.log('[NetworkStatus] Back online! Triggering background ESPRO sync...')
            await window.bunkmate.espro.syncAttendance(currentSemester)
          }
        }
      } catch (err) {
        console.warn('[NetworkStatus] Auto ESPRO sync on reconnect failed:', err)
      }
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [currentSemester])

  return isOnline
}
