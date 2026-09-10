import { useEffect, useState } from 'react'
import {
  UserCheck,
  KeyRound,
  RefreshCw,
  LogOut,
  Download,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Lock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useToastStore } from '@/store/toast-store'
import { useSettingsStore } from '@/store/settings-store'
import { useAttendanceStore } from '@/store/attendance-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useTimetableStore } from '@/store/timetable-store'
import { PrivacyPolicyDialog } from '@/components/privacy-policy-dialog'
import { SignOutDialog } from '@/components/sign-out-dialog'
import { EsproProgressBar } from '@/components/espro-progress-bar'
import { useEsproSyncStore } from '@/store/espro-sync-store'
import type { EsproStatus } from '../../electron/espro/types'

export function AccountPage() {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const esproAutoYellowForms = useSettingsStore((s) => s.esproAutoYellowForms)
  const setEsproAutoYellowForms = useSettingsStore((s) => s.setEsproAutoYellowForms)
  const loadRecords = useAttendanceStore((s) => s.load)
  const pushToast = useToastStore((s) => s.push)

  const [esproStatus, setEsproStatus] = useState<EsproStatus | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [saving, setSaving] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  // Auto-updater state
  const [checkingUpdate, setCheckingUpdate] = useState(false)
  const [updateStatus, setUpdateStatus] = useState<{
    status: string
    info?: any
    progress?: any
    error?: string
  }>({ status: 'idle' })

  async function loadStatus() {
    try {
      const status = await window.bunkmate.espro.getStatus()
      setEsproStatus(status)
      if (status.username) setUsername(status.username)
      if (status.sessionId) setSessionId(status.sessionId)
    } catch {
      setEsproStatus(null)
    }
  }

  useEffect(() => {
    loadStatus()

    if (window.bunkmate?.updater?.onStatusChange) {
      return window.bunkmate.updater.onStatusChange((payload: any) => {
        setUpdateStatus(payload)
      })
    }
  }, [])

  async function handleSaveAndSync() {
    if (!username.trim() || !password) {
      pushToast({ title: 'Missing inputs', description: 'Please provide both Register Number and Password.' })
      return
    }

    setSaving(true)
    try {
      const saveRes = await window.bunkmate.espro.saveCredential({
        username: username.trim(),
        password,
      })

      if (!saveRes.ok) {
        pushToast({ title: "Couldn't save credentials", description: saveRes.message })
        return
      }

      if (sessionId.trim()) {
        await window.bunkmate.espro.saveSessionId(sessionId.trim())
      }

      setPassword('')
      pushToast({ title: 'Credentials Saved', description: 'Encrypted locally. Starting live ESPRO sync...' })
      await loadStatus()

      if (currentSemester) {
        useEsproSyncStore.getState().startSync('Connecting to ESPRO & starting sync...')
        await handleAutoImport()
      }
    } catch {
      pushToast({ title: 'Sign-in failed', description: 'Could not store credentials safely.' })
    } finally {
      setSaving(false)
    }
  }

  async function handleAutoImport() {
    setSyncing(true)
    useEsproSyncStore.getState().startSync('Initializing 1-Click ESPRO Auto-Import...')
    try {
      const targetSem = currentSemester || ''
      const res = await window.bunkmate.espro.autoImport(targetSem)
      
      await useSemestersStore.getState().load()
      await useSettingsStore.getState().load()
      useSubjectsStore.getState().load({ includeArchived: false })
      if (targetSem) await useTimetableStore.getState().load(targetSem)
      await loadRecords()

      pushToast({
        title: res.offlineCached ? 'Offline Mode (Cached Data)' : 'ESPRO Auto-Import Complete',
        description: res.offlineCached
          ? 'No internet. Displaying latest cached attendance logs.'
          : `Imported ${res.created} new class period(s) across ${res.subjectsCreated} subject(s).`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      pushToast({ title: 'Sync Failed', description: msg })
    } finally {
      setSyncing(false)
    }
  }

  async function handleCheckForUpdates() {
    if (!window.bunkmate?.updater) {
      pushToast({
        title: 'Updates Available via GitHub Releases',
        description: 'Visit github.com/ThorJS24/BunkMate-Pro/releases',
      })
      return
    }
    setCheckingUpdate(true)
    setUpdateStatus({ status: 'checking' })
    try {
      const res = await window.bunkmate.updater.checkForUpdates()
      setUpdateStatus(res as any)
      if (res.status === 'not-available') {
        pushToast({
          title: 'App is Up to Date',
          description: res.error || 'You are running the latest version of BunkMate Pro (v2.1.3).',
        })
      } else if (res.status === 'available') {
        pushToast({
          title: 'New Update Found!',
          description: `Version ${(res.info as any)?.version ?? ''} is ready for download.`,
        })
      } else if (res.status === 'error') {
        pushToast({
          title: 'Update Check Status',
          description: res.error || 'Unable to contact update server.',
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      setUpdateStatus({ status: 'error', error: msg })
      pushToast({ title: 'Update Check Failed', description: msg })
    } finally {
      setCheckingUpdate(false)
    }
  }

  async function handleDownloadUpdate() {
    if (!window.bunkmate?.updater) return
    try {
      await window.bunkmate.updater.downloadUpdate()
      pushToast({ title: 'Downloading Update...' })
    } catch (err) {
      pushToast({ title: 'Download failed', description: String(err) })
    }
  }

  function handleInstallUpdate() {
    if (!window.bunkmate?.updater) return
    window.bunkmate.updater.quitAndInstall()
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <UserCheck className="size-6 text-primary" /> Account & ESPRO Synchronization
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your CHRIST University ESPRO portal connection, encrypted credentials, and software updates.
          </p>
        </div>

        {esproStatus?.hasCredential ? (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/30 gap-1.5 py-1 px-3 text-xs dark:text-emerald-400">
            <CheckCircle2 className="size-3.5 text-emerald-500" /> Connected ({esproStatus.username})
          </Badge>
        ) : (
          <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30 gap-1.5 py-1 px-3 text-xs">
            <AlertCircle className="size-3.5 text-amber-500" /> Not Connected
          </Badge>
        )}
      </div>

      {/* Main Login / Account Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <KeyRound className="size-5 text-primary" /> CHRIST ESPRO Sign-In
          </CardTitle>
          <CardDescription>
            Enter your CHRIST University Student Register Number and Password. Credentials are encrypted on your computer via Windows DPAPI / OS Keychain and sent only to official CHRIST University servers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-username">Register Number / Student ID</Label>
              <Input
                id="account-username"
                placeholder="e.g. 23112001"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Your official CHRIST student registration number.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="account-password">ESPRO Password</Label>
              <Input
                id="account-password"
                type="password"
                placeholder={esproStatus?.hasCredential ? '••••••••••••' : 'Enter password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">Encrypted locally on device. Never sent to third parties.</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="account-session">ESPRO Term / Session ID (Optional)</Label>
            <Input
              id="account-session"
              placeholder="Auto-discovered if blank (e.g. Session 25)"
              value={sessionId}
              onChange={(e) => setSessionId(e.target.value)}
              className="sm:w-1/2"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border p-3.5 bg-muted/20">
            <div className="space-y-0.5">
              <Label htmlFor="auto-yellow-forms" className="text-sm font-medium cursor-pointer">
                Auto-create Yellow Forms on Sync
              </Label>
              <p className="text-xs text-muted-foreground">
                Automatically file approved Yellow Forms when ESPRO records Co-curricular or Medical duty leave.
              </p>
            </div>
            <Switch
              id="auto-yellow-forms"
              checked={esproAutoYellowForms}
              onCheckedChange={(checked) => setEsproAutoYellowForms(checked)}
            />
          </div>

          <EsproProgressBar className="my-3" />

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <Button onClick={handleSaveAndSync} disabled={saving || syncing}>
                <RefreshCw className={`size-4 mr-2 ${saving || syncing ? 'animate-spin' : ''}`} />
                {saving ? 'Saving...' : syncing ? 'Syncing ESPRO...' : esproStatus?.hasCredential ? 'Update & Sync' : 'Sign In & Sync'}
              </Button>

              {esproStatus?.hasCredential && (
                <Button variant="outline" onClick={handleAutoImport} disabled={syncing}>
                  <Sparkles className="size-4 mr-2 text-primary" /> 1-Click Auto-Import
                </Button>
              )}
            </div>

            {esproStatus?.hasCredential && (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setSignOutOpen(true)}>
                <LogOut className="size-4 mr-1.5" /> Sign Out & Clear Data
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Updater Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Download className="size-5 text-primary" /> Software Updates & Auto-Update
          </CardTitle>
          <CardDescription>
            Automatic app update checker. Keep your BunkMate Pro client up to date with new feature releases and bug fixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4 bg-muted/20">
            <div>
              <p className="text-sm font-medium">Installed Version</p>
              <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                v{window.bunkmate?.versions?.app || '2.1.2'} (Multi-Platform Production Release)
              </p>
            </div>

            <div className="flex items-center gap-2">
              {updateStatus.status === 'downloaded' ? (
                <Button size="sm" onClick={handleInstallUpdate} className="bg-emerald-600 text-white hover:bg-emerald-700">
                  <CheckCircle2 className="size-4 mr-1.5" /> Restart & Install Update
                </Button>
              ) : updateStatus.status === 'available' ? (
                <Button size="sm" onClick={handleDownloadUpdate}>
                  <Download className="size-4 mr-1.5" /> Download Update
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleCheckForUpdates} disabled={checkingUpdate}>
                  <RefreshCw className={`size-3.5 mr-1.5 ${checkingUpdate ? 'animate-spin' : ''}`} />
                  {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                </Button>
              )}
            </div>
          </div>

          {updateStatus.status === 'checking' && (
            <div className="rounded-lg border bg-muted/30 p-3 text-xs space-y-1">
              <p className="font-medium text-foreground flex items-center gap-1.5">
                <RefreshCw className="size-4 animate-spin text-primary" /> Checking GitHub Releases for software updates...
              </p>
            </div>
          )}

          {updateStatus.status === 'not-available' && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs space-y-1">
              <p className="font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <CheckCircle2 className="size-4 text-emerald-500" /> BunkMate Pro is up to date!
              </p>
              {updateStatus.error && <p className="text-muted-foreground text-[11px]">{updateStatus.error}</p>}
            </div>
          )}

          {updateStatus.status === 'error' && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs space-y-1">
              <p className="font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="size-4 text-amber-500" /> Update Check Status
              </p>
              <p className="text-muted-foreground text-[11px]">{updateStatus.error || 'Could not fetch release payload.'}</p>
            </div>
          )}

          {updateStatus.status === 'downloading' && (
            <div className="rounded-lg border bg-primary/5 p-3 text-xs space-y-1">
              <p className="font-medium text-primary flex items-center gap-1.5">
                <Download className="size-4 animate-bounce" /> Downloading update package...
              </p>
              {updateStatus.progress?.percent && (
                <p className="text-muted-foreground text-[11px] tabular-nums">
                  {updateStatus.progress.percent.toFixed(1)}% downloaded ({Math.round((updateStatus.progress.bytesPerSecond || 0) / 1024)} KB/s)
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance & Privacy Rights Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="size-5 text-emerald-500" /> Privacy & Legal Protection (DPDP Act & GDPR)
          </CardTitle>
          <CardDescription>
            BunkMate Pro adheres strictly to the Digital Personal Data Protection (DPDP) Act 2023 of India and General Data Protection Regulation (GDPR).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
            <div className="rounded border p-3 bg-card/60">
              <p className="font-medium text-foreground">Zero Central Data Collection</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Your personal details, attendance records, and passwords are store exclusively on your device. Zero telemetry.
              </p>
            </div>
            <div className="rounded border p-3 bg-card/60">
              <p className="font-medium text-foreground">Right to Erasure & Portability</p>
              <p className="text-muted-foreground mt-1 text-[11px]">
                Purge your credentials or export full attendance backups at any time with complete transparency.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <PrivacyPolicyDialog triggerText="Read Full Privacy Policy & Compliance Notice" />
          </div>
        </CardContent>
      </Card>

      {/* Sign Out Confirmation Dialog */}
      <SignOutDialog
        open={signOutOpen}
        onOpenChange={setSignOutOpen}
        onCredentialsCleared={() => {
          setUsername('')
          setPassword('')
          loadStatus()
        }}
      />
    </div>
  )
}
