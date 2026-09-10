import { useState } from 'react'
import { LogOut, KeyRound, Trash2, AlertTriangle, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useToastStore } from '@/store/toast-store'

interface SignOutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCredentialsCleared?: () => void
}

export function SignOutDialog({ open, onOpenChange, onCredentialsCleared }: SignOutDialogProps) {
  const pushToast = useToastStore((s) => s.push)
  const [clearingOnlyCreds, setClearingOnlyCreds] = useState(false)
  const [wipingAllData, setWipingAllData] = useState(false)

  async function handleClearCredentialsOnly() {
    setClearingOnlyCreds(true)
    try {
      await window.bunkmate.espro.removeCredential()
      pushToast({
        title: 'Signed Out',
        description: 'ESPRO credentials deleted from device. Local attendance records preserved.',
      })
      onOpenChange(false)
      onCredentialsCleared?.()
    } catch {
      pushToast({
        title: 'Sign Out Failed',
        description: 'Could not remove credentials from safeStorage.',
      })
    } finally {
      setClearingOnlyCreds(false)
    }
  }

  async function handleWipeAllDataAndSignOut() {
    setWipingAllData(true)
    try {
      // 1. Remove credentials from safeStorage
      await window.bunkmate.espro.removeCredential()
      // 2. Wipe SQLite database tables
      await window.bunkmate.dangerZone.clearAllData()
      pushToast({
        title: 'Factory Reset Complete',
        description: 'All local attendance data, timetable, exams, and stored credentials have been completely wiped.',
      })
      onOpenChange(false)
      // 3. Reload application window so all Zustand stores reset to clean initial state
      window.location.reload()
    } catch (error) {
      pushToast({
        title: 'Reset Failed',
        description: error instanceof Error ? error.message : 'Could not clear database records.',
      })
      setWipingAllData(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="size-5 text-destructive" /> Sign Out & Data Removal Options
          </DialogTitle>
          <DialogDescription>
            Choose how you want to sign out. You can remove stored ESPRO credentials only, or perform a complete factory reset of all local app data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* Option 1: Credentials Only */}
          <div className="rounded-lg border p-3.5 bg-card hover:bg-accent/40 transition-colors space-y-2">
            <div className="flex items-start gap-2.5">
              <KeyRound className="size-4 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-foreground">Option 1: Clear Stored Credentials Only</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Deletes your encrypted ESPRO password and Register Number from OS Keychain / DPAPI. Your local attendance records, subjects, and timetable remain saved for offline use.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={handleClearCredentialsOnly}
                disabled={clearingOnlyCreds || wipingAllData}
              >
                {clearingOnlyCreds ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Clearing...
                  </>
                ) : (
                  <>
                    <LogOut className="size-3.5 mr-1.5" /> Sign Out (Keep Data)
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Option 2: Full Wipe */}
          <div className="rounded-lg border border-destructive/30 p-3.5 bg-destructive/5 space-y-2">
            <div className="flex items-start gap-2.5">
              <Trash2 className="size-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-destructive">Option 2: Wipe ALL Local Data & Reset</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Completely removes stored credentials <span className="font-semibold text-foreground">AND</span> deletes all local SQLite database tables (semesters, subjects, attendance logs, timetables, exams, yellow forms). Irreversible.
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-1">
              <Button
                variant="destructive"
                size="sm"
                onClick={handleWipeAllDataAndSignOut}
                disabled={clearingOnlyCreds || wipingAllData}
              >
                {wipingAllData ? (
                  <>
                    <RefreshCw className="size-3.5 mr-1.5 animate-spin" /> Wiping Everything...
                  </>
                ) : (
                  <>
                    <Trash2 className="size-3.5 mr-1.5" /> Wipe All Data & Reset
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} disabled={clearingOnlyCreds || wipingAllData}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
