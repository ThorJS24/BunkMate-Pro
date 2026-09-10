import { useState } from 'react'
import { RefreshCw, ShieldCheck, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useToastStore } from '@/store/toast-store'
import { useSettingsStore } from '@/store/settings-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useEsproSyncStore } from '@/store/espro-sync-store'
import { useTimetableStore } from '@/store/timetable-store'
import { EsproProgressBar } from '@/components/espro-progress-bar'

interface QuickEsproSyncProps {
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  size?: 'default' | 'sm' | 'lg' | 'icon'
  className?: string
}

export function QuickEsproSyncButton({ variant = 'outline', size = 'sm', className }: QuickEsproSyncProps) {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const loadRecords = useAttendanceStore((s) => s.load)
  const pushToast = useToastStore((s) => s.push)

  const [syncing, setSyncing] = useState(false)
  const [setupOpen, setSetupOpen] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)

  async function handleQuickSync() {
    if (!currentSemester) {
      pushToast({ title: 'No semester selected', description: 'Set an active semester first.' })
      return
    }

    setSyncing(true)
    try {
      const status = await window.bunkmate.espro.getStatus()
      if (!status.hasCredential) {
        setSetupOpen(true)
        setSyncing(false)
        return
      }

      useEsproSyncStore.getState().startSync('Connecting to ESPRO & starting sync...')
      const res = await window.bunkmate.espro.syncAttendance(currentSemester)

      if (res.missingPeriodTimes) {
        pushToast({
          title: 'Period times missing',
          description: 'Auto-allocate period clock times in Timetable > Grid Settings first.',
        })
        return
      }

      await loadRecords()

      pushToast({
        title: res.offlineCached ? 'Offline Mode (Cached Data)' : 'ESPRO Sync Complete',
        description: res.offlineCached
          ? 'No internet connection. Displaying latest cached attendance records.'
          : `Imported ${res.created} new period(s), updated ${res.updated} period(s).`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      pushToast({
        title: 'ESPRO Sync Failed',
        description: msg,
      })
    } finally {
      setSyncing(false)
    }
  }

  async function handleAutoImport() {
    if (!currentSemester) {
      pushToast({ title: 'No semester selected', description: 'Set an active semester first.' })
      return
    }

    setSyncing(true)
    try {
      const status = await window.bunkmate.espro.getStatus()
      if (!status.hasCredential) {
        setSetupOpen(true)
        setSyncing(false)
        return
      }

      useEsproSyncStore.getState().startSync('Initializing 1-Click ESPRO Auto-Import...')
      const res = await window.bunkmate.espro.autoImport(currentSemester)

      useSubjectsStore.getState().load({ includeArchived: false })
      await useTimetableStore.getState().load(currentSemester)
      await loadRecords()

      pushToast({
        title: res.offlineCached ? 'Offline Mode (Cached Data)' : 'ESPRO Auto-Import Complete',
        description: res.offlineCached
          ? 'No internet connection. Displaying latest cached attendance records.'
          : `Created ${res.subjectsCreated} subject(s), imported ${res.created} period(s).`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      pushToast({
        title: 'ESPRO Auto-Import Failed',
        description: msg,
      })
    } finally {
      setSyncing(false)
    }
  }

  async function handleSaveAndSync() {
    if (!username.trim() || !password) {
      pushToast({ title: 'Missing credentials', description: 'Please enter both username and password.' })
      return
    }

    setSavingCreds(true)
    try {
      const saveRes = await window.bunkmate.espro.saveCredential({
        username: username.trim(),
        password,
      })

      if (!saveRes.ok) {
        pushToast({ title: 'Could not save credentials', description: saveRes.message })
        return
      }

      if (sessionId.trim()) {
        await window.bunkmate.espro.saveSessionId(sessionId.trim())
      }

      setPassword('')
      setSetupOpen(false)

      pushToast({ title: 'Credentials saved', description: 'Encrypted securely. Scraping & Auto-Importing...' })
      await handleAutoImport()
    } catch {
      pushToast({ title: 'Setup failed', description: 'Failed to save encrypted credentials.' })
    } finally {
      setSavingCreds(false)
    }
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        disabled={syncing}
        onClick={handleQuickSync}
        title="Quick Sync attendance directly with CHRIST ESPRO Portal"
      >
        <RefreshCw className={`size-4 ${syncing ? 'animate-spin' : ''}`} />
        <span>{syncing ? 'Syncing ESPRO...' : 'Sync ESPRO'}</span>
      </Button>

      <Dialog open={setupOpen} onOpenChange={setSetupOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="size-5 text-primary" /> Connect ESPRO Account
            </DialogTitle>
            <DialogDescription>
              Enter your CHRIST University register number and password. Your password is encrypted locally via Windows DPAPI/OS Keychain and never leaves your computer.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="espro-user">Register Number / Username</Label>
              <Input
                id="espro-user"
                placeholder="e.g. 23112001"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="espro-pass">ESPRO Password</Label>
              <Input
                id="espro-pass"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="espro-session">ESPRO Session/Term ID (Optional)</Label>
              <Input
                id="espro-session"
                placeholder="e.g. 123"
                value={sessionId}
                onChange={(e) => setSessionId(e.target.value)}
              />
            </div>

            <div className="flex items-center gap-2 rounded border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <ShieldCheck className="size-4 shrink-0 text-success" />
              <span>Stored locally on this device only. Never sent to any server except official CHRIST endpoints.</span>
            </div>

            <EsproProgressBar className="my-2" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSetupOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveAndSync} disabled={savingCreds}>
              {savingCreds ? 'Saving...' : 'Save & Sync Now'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
