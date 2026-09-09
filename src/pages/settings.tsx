import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderOpen, Save, Upload, Trash2, KeyRound, AlertTriangle, PictureInPicture2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { EsproDisclosure, EsproAboutDialog } from '@/components/espro-disclosure'
import { CollapsibleSection } from '@/components/collapsible-section'
import { HelpHint } from '@/components/help-hint'
import { friendlyError } from '@/lib/friendly-error'
import { useSettingsStore } from '@/store/settings-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useToastStore } from '@/store/toast-store'
import { NOTIFICATION_CATEGORY_LABELS, type NotificationCategory } from '@/lib/notifications'
import { isValidHexColor } from '@/lib/accent-color'
import { cn } from '@/lib/utils'
import { THEME_PACKS, type ThemePack } from '@/db/schema'
import type { EsproStatus } from '../../electron/espro/types'

const THEME_PACK_INFO: Record<ThemePack, { label: string; swatch: string }> = {
  ledger: { label: 'Ledger', swatch: 'oklch(0.34 0.08 258)' },
  ocean: { label: 'Ocean', swatch: 'oklch(0.34 0.08 230)' },
  forest: { label: 'Forest', swatch: 'oklch(0.34 0.08 150)' },
  sunset: { label: 'Sunset', swatch: 'oklch(0.4 0.12 40)' },
  crest: { label: 'Crest', swatch: 'oklch(0.6 0.15 65)' },
  founders: { label: 'Founders', swatch: 'oklch(0.22 0.045 255)' },
  campus: { label: 'Campus', swatch: 'oklch(0.42 0.11 250)' },
  convocation: { label: 'Convocation', swatch: 'oklch(0.22 0.045 255)' },
}

export function SettingsPage() {
  const {
    overallMinTarget,
    subjectMinTarget,
    theme,
    density,
    themePack,
    accentColor,
    fontScale,
    highContrast,
    crashLogEnabled,
    launchView,
    atRiskMarginPp,
    mutedNotificationCategories,
    classReminders,
    examReminders,
    weeklyDigestEnabled,
    themeScheduleStart,
    themeScheduleEnd,
    classReminderLeadMinutes,
    currentSemester,
    setCurrentSemester,
    backupIntervalDays,
    backupDir,
    lastBackupAt,
    setOverallMinTarget,
    setSubjectMinTarget,
    setAtRiskMarginPp,
    setTheme,
    setDensity,
    setThemePack,
    setAccentColor,
    setFontScale,
    setHighContrast,
    setCrashLogEnabled,
    setLaunchView,
    setMutedNotificationCategories,
    setClassReminders,
    setExamReminders,
    setWeeklyDigestEnabled,
    setThemeScheduleStart,
    setThemeScheduleEnd,
    setClassReminderLeadMinutes,
    setBackupIntervalDays,
    setBackupDir,
    load,
  } = useSettingsStore()
  const pushToast = useToastStore((s) => s.push)

  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)
  useEffect(() => {
    loadSemesters()
  }, [loadSemesters])
  // Reminders need real clock times, which come from Grid Settings'
  // auto-allocate. If the active semester has none, the feature can't work,
  // so it's disabled with an explanation rather than silently doing nothing.
  const activeSemesterHasTimes =
    (semesters.find((s) => s.label === currentSemester)?.periodTimes?.length ?? 0) > 0

  const [overallMinTargetInput, setOverallMinTargetInput] = useState(String(overallMinTarget))
  const [subjectMinTargetInput, setSubjectMinTargetInput] = useState(String(subjectMinTarget))
  const [atRiskMarginInput, setAtRiskMarginInput] = useState(String(atRiskMarginPp))
  const [leadInput, setLeadInput] = useState(String(classReminderLeadMinutes))
  const [intervalInput, setIntervalInput] = useState(String(backupIntervalDays))
  const [accentColorInput, setAccentColorInput] = useState(accentColor ?? '')
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false)
  const [backingUp, setBackingUp] = useState(false)
  const [clearDataOpen, setClearDataOpen] = useState(false)
  const [clearDataText, setClearDataText] = useState('')
  const [clearingData, setClearingData] = useState(false)
  const [restoring, setRestoring] = useState(false)

  // ESPRO sync credential state. The password lives only in this component's
  // local state while being typed and is cleared right after a save — it's
  // never lifted into a store or persisted unencrypted.
  const [esproStatus, setEsproStatus] = useState<EsproStatus | null>(null)
  const [esproAck, setEsproAck] = useState(false)
  const [esproUsername, setEsproUsername] = useState('')
  const [esproPassword, setEsproPassword] = useState('')
  const [esproSaving, setEsproSaving] = useState(false)
  const [esproRemoveOpen, setEsproRemoveOpen] = useState(false)
  const [esproAboutOpen, setEsproAboutOpen] = useState(false)
  // Session/term number scoping the attendance-totals comparison — not a
  // secret, stored alongside the username (see credential-store.ts). The
  // comparison itself (action + results) lives on the Dashboard.
  const [esproSessionIdInput, setEsproSessionIdInput] = useState('')
  const [esproSavingSessionId, setEsproSavingSessionId] = useState(false)

  // Keeps the text field in sync if accentColor changes from elsewhere (e.g.
  // the initial load() populating it from the DB after this component mounted).
  useEffect(() => {
    setAccentColorInput(accentColor ?? '')
  }, [accentColor])

  function handleAccentColorPicker(value: string) {
    // The native <input type="color"> always yields a valid "#rrggbb", so
    // this can commit immediately — unlike the free-text field below, which
    // needs to tolerate a partial/invalid value while the user is typing.
    setAccentColorInput(value)
    setAccentColor(value)
  }

  function commitAccentColorText() {
    const trimmed = accentColorInput.trim()
    if (!trimmed) {
      setAccentColor(null)
      return
    }
    if (isValidHexColor(trimmed)) {
      setAccentColor(trimmed)
    } else {
      pushToast({ title: 'Invalid color', description: 'Use a 6-digit hex code, like #2a78d6.' })
      setAccentColorInput(accentColor ?? '')
    }
  }

  function clearAccentColor() {
    setAccentColorInput('')
    setAccentColor(null)
  }

  async function loadEsproStatus() {
    try {
      const status = await window.bunkmate.espro.getStatus()
      setEsproStatus(status)
      setEsproSessionIdInput(status.sessionId ?? '')
    } catch {
      // No handler yet / unexpected failure — fail safe to "can't store".
      setEsproStatus({ encryptionAvailable: false, hasCredential: false, username: null, sessionId: null })
    }
  }

  useEffect(() => {
    loadEsproStatus()
  }, [])

  async function handleEsproSave() {
    if (!esproUsername.trim() || !esproPassword) return
    setEsproSaving(true)
    try {
      const result = await window.bunkmate.espro.saveCredential({
        username: esproUsername.trim(),
        password: esproPassword,
      })
      if (result.ok) {
        setEsproPassword('') // drop the plaintext from memory immediately
        setEsproAck(false)
        pushToast({ title: 'ESPRO credentials saved', description: 'Encrypted and stored on this device.' })
        await loadEsproStatus()
      } else {
        pushToast({ title: "Couldn't save credentials", description: result.message })
      }
    } catch {
      pushToast({ title: "Couldn't save credentials", description: 'ESPRO storage is unavailable.' })
    } finally {
      setEsproSaving(false)
    }
  }

  async function handleEsproRemove() {
    setEsproRemoveOpen(false)
    try {
      await window.bunkmate.espro.removeCredential()
      setEsproUsername('')
      setEsproPassword('')
      setEsproAck(false)
      pushToast({ title: 'ESPRO credentials removed', description: 'The encrypted file was deleted.' })
      await loadEsproStatus()
    } catch {
      pushToast({ title: "Couldn't remove credentials" })
    }
  }

  async function handleSaveEsproSessionId() {
    setEsproSavingSessionId(true)
    try {
      await window.bunkmate.espro.saveSessionId(esproSessionIdInput.trim())
      pushToast({ title: 'ESPRO session number saved' })
      await loadEsproStatus()
    } catch {
      pushToast({ title: "Couldn't save the session number" })
    } finally {
      setEsproSavingSessionId(false)
    }
  }

  async function handleChooseBackupDir() {
    const dir = await window.bunkmate.backup.chooseDir()
    if (dir) await setBackupDir(dir)
  }

  async function handleBackupNow() {
    setBackingUp(true)
    try {
      const path = await window.bunkmate.backup.now()
      if (path) {
        await load()
        pushToast({ title: 'Backup created', description: path })
      }
    } finally {
      setBackingUp(false)
    }
  }

  async function handleRestore() {
    setRestoreConfirmOpen(false)
    setRestoring(true)
    try {
      const didRestore = await window.bunkmate.backup.restore()
      if (!didRestore) setRestoring(false)
      // On success the app relaunches immediately; nothing left to do here.
    } catch (error) {
      // Previously swallowed silently — a failed restore (bad file, locked
      // file, disk error) looked identical to "nothing happened" with no
      // way to tell what went wrong.
      const fe = friendlyError(error, 'Could not restore from that backup')
      pushToast({ title: 'Could not restore from that backup', description: fe.message, detail: fe.detail })
      setRestoring(false)
    }
  }

  async function handleClearAllData() {
    if (clearDataText !== 'DELETE') return
    setClearingData(true)
    try {
      await window.bunkmate.dangerZone.clearAllData()
      // Every store in the app is now stale at once — a reload is simpler
      // and safer than teaching each one to reset itself, same reasoning as
      // the sample-data seed in the setup wizard.
      window.location.reload()
    } catch (error) {
      const fe = friendlyError(error, 'Could not clear data')
      pushToast({ title: 'Could not clear data', description: fe.message, detail: fe.detail })
      setClearingData(false)
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Attendance</CardTitle>
          <CardDescription>
            CHRIST's handbook sets two different numbers: 75% in each individual subject to sit that subject's Mid
            Semester Exam, and a higher 85% aggregate across all subjects combined to sit the End Semester Exam —
            falling below 85% aggregate is what leads to detention. These two targets track both separately.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="space-y-2">
            <Label htmlFor="overall-min-target">Aggregate target, all subjects (%)</Label>
            <Input
              id="overall-min-target"
              type="number"
              min={0}
              max={100}
              className="w-28"
              value={overallMinTargetInput}
              onChange={(e) => setOverallMinTargetInput(e.target.value)}
              onBlur={() => {
                const clamped = Math.min(100, Math.max(0, Number(overallMinTargetInput) || 0))
                setOverallMinTargetInput(String(clamped))
                setOverallMinTarget(clamped)
              }}
            />
            <p className="text-xs text-muted-foreground">85% is the University norm — below this, you risk detention.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject-min-target">Default per-subject target (%)</Label>
            <Input
              id="subject-min-target"
              type="number"
              min={0}
              max={100}
              className="w-28"
              value={subjectMinTargetInput}
              onChange={(e) => setSubjectMinTargetInput(e.target.value)}
              onBlur={() => {
                const clamped = Math.min(100, Math.max(0, Number(subjectMinTargetInput) || 0))
                setSubjectMinTargetInput(String(clamped))
                setSubjectMinTarget(clamped)
              }}
            />
            <p className="text-xs text-muted-foreground">75% is required per course to sit that Mid Semester Exam.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="at-risk-margin">"Getting close" warning range (%)</Label>
            <Input
              id="at-risk-margin"
              type="number"
              min={0}
              max={50}
              className="w-28"
              value={atRiskMarginInput}
              onChange={(e) => setAtRiskMarginInput(e.target.value)}
              onBlur={() => {
                const clamped = Math.min(50, Math.max(0, Number(atRiskMarginInput) || 0))
                setAtRiskMarginInput(String(clamped))
                setAtRiskMarginPp(clamped)
              }}
            />
            <p className="text-xs text-muted-foreground">
              Show an amber warning when you're within this many percentage points of your target — e.g. with a 75%
              target and a 5 here, 76–79% shows amber instead of green. Set to 0 to turn this off.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Semesters & Active Term</CardTitle>
          <CardDescription>
            Choose your active current semester or manage semester terms, period counts, and rollover structure on the{' '}
            <Link to="/semesters" className="underline font-medium">
              Semesters
            </Link>{' '}
            page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-4">
          <div className="space-y-2">
            <Label htmlFor="active-semester-select">Active Semester</Label>
            <Select value={currentSemester} onValueChange={setCurrentSemester}>
              <SelectTrigger id="active-semester-select" className="w-48">
                <SelectValue placeholder="Select active semester" />
              </SelectTrigger>
              <SelectContent>
                {semesters.map((s) => (
                  <SelectItem key={s.id} value={s.label}>
                    {s.label}
                    {s.isActive ? ' (active)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PictureInPicture2 className="size-5 text-primary" /> Desktop Companion & Mini Window
          </CardTitle>
          <CardDescription>
            Always-on-top compact window for quick period logging and glanceable attendance metrics.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-center gap-3">
          <Button
            variant="outline"
            onClick={async () => {
              try {
                await window.bunkmate.miniWindow.toggle()
                pushToast({ title: 'Toggled Mini Window' })
              } catch {
                pushToast({ title: 'Mini Window active in Desktop environment' })
              }
            }}
          >
            <PictureInPicture2 className="size-4 mr-2" /> Toggle Mini Window Companion
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-6">
          <div className="space-y-2">
            <Label htmlFor="theme">Theme</Label>
            <Select value={theme} onValueChange={setTheme}>
              <SelectTrigger id="theme" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="system">System</SelectItem>
                <SelectItem value="light">Light</SelectItem>
                <SelectItem value="dark">Dark</SelectItem>
                <SelectItem value="schedule">Scheduled</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {theme === 'schedule' && (
            <div className="flex items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="theme-schedule-start">Dark from</Label>
                <Input
                  id="theme-schedule-start"
                  type="time"
                  className="w-28"
                  value={themeScheduleStart}
                  onChange={(e) => setThemeScheduleStart(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="theme-schedule-end">Light from</Label>
                <Input
                  id="theme-schedule-end"
                  type="time"
                  className="w-28"
                  value={themeScheduleEnd}
                  onChange={(e) => setThemeScheduleEnd(e.target.value)}
                />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="density" className="flex items-center gap-1">
              Density
              <HelpHint text='How tightly spaced lists and tables are. "Compact" fits more on screen; "Comfortable" is easier to tap.' />
            </Label>
            <Select value={density} onValueChange={setDensity}>
              <SelectTrigger id="density" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="comfortable">Comfortable</SelectItem>
                <SelectItem value="compact">Compact</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="launch-view" className="flex items-center gap-1">
              Open on launch
              <HelpHint text="Which page BunkMate shows first when you start it." />
            </Label>
            <Select value={launchView} onValueChange={setLaunchView}>
              <SelectTrigger id="launch-view" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="dashboard">Dashboard</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="font-scale" className="flex items-center gap-1">
              Text size
              <HelpHint text="Scales the whole app's text and controls, not just body text — useful if the default reads small." />
            </Label>
            <Select value={fontScale} onValueChange={setFontScale}>
              <SelectTrigger id="font-scale" className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">Default</SelectItem>
                <SelectItem value="large">Large</SelectItem>
                <SelectItem value="larger">Larger</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="high-contrast" className="flex items-center gap-1">
              High contrast
              <HelpHint text="Stronger contrast for muted text, borders, and the keyboard focus outline." />
            </Label>
            <div className="flex h-9 items-center">
              <Switch id="high-contrast" checked={highContrast} onCheckedChange={setHighContrast} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="flex items-center gap-1">
              Mini mode
              <HelpHint text="A small always-on-top window showing your overall % and next class — also available from the tray icon." />
            </Label>
            <Button type="button" variant="outline" onClick={() => window.bunkmate.miniWindow.toggle()}>
              <PictureInPicture2 /> Open mini mode
            </Button>
          </div>

          <div className="w-full space-y-2">
            <Label>Theme pack</Label>
            <div className="flex flex-wrap gap-2">
              {THEME_PACKS.map((pack) => (
                <button
                  key={pack}
                  type="button"
                  onClick={() => setThemePack(pack)}
                  className={cn(
                    'flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors',
                    themePack === pack ? 'border-primary bg-accent' : 'border-input hover:bg-accent/50',
                  )}
                >
                  <span
                    className="size-3.5 shrink-0 rounded-full"
                    style={{ backgroundColor: THEME_PACK_INFO[pack].swatch }}
                  />
                  {THEME_PACK_INFO[pack].label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            Turn off any alert category you don't want in the bell. Muted categories stop appearing entirely;
            dismissing or marking individual alerts read is done from the bell itself.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(Object.keys(NOTIFICATION_CATEGORY_LABELS) as NotificationCategory[]).map((category) => {
            const muted = mutedNotificationCategories.includes(category)
            return (
              <div key={category} className="flex items-center justify-between">
                <Label htmlFor={`notif-${category}`} className="font-normal">
                  {NOTIFICATION_CATEGORY_LABELS[category]}
                </Label>
                <Switch
                  id={`notif-${category}`}
                  checked={!muted}
                  onCheckedChange={(enabled) => {
                    const next = enabled
                      ? mutedNotificationCategories.filter((c) => c !== category)
                      : [...mutedNotificationCategories, category]
                    setMutedNotificationCategories(next)
                  }}
                />
              </div>
            )
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Class &amp; exam reminders</CardTitle>
          <CardDescription>
            Desktop notifications before a class or exam. Only fires while BunkMate is running, since it isn't a
            background service, so nothing is sent when the app is closed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="exam-reminders" className="font-normal">
                Remind me about exams
              </Label>
              <p className="text-xs text-muted-foreground">
                The evening before (6pm) and on the morning of, with the time and room.
              </p>
            </div>
            <Switch id="exam-reminders" checked={examReminders} onCheckedChange={setExamReminders} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <Label htmlFor="weekly-digest" className="font-normal">
                Weekly digest
              </Label>
              <p className="text-xs text-muted-foreground">
                Sunday evening (6pm): this week's overall %, subjects below target, and exams coming up.
              </p>
            </div>
            <Switch id="weekly-digest" checked={weeklyDigestEnabled} onCheckedChange={setWeeklyDigestEnabled} />
          </div>
          <div className="border-t pt-3" />
          {!activeSemesterHasTimes ? (
            <p className="text-sm text-muted-foreground">
              Reminders need to know your actual class times first. Go to{' '}
              <Link to="/timetable" className="font-medium underline">
                Timetable
              </Link>{' '}
              → Grid settings → Auto-allocate times, then come back here to turn reminders on.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <Label htmlFor="class-reminders" className="font-normal">
                  Remind me before class
                </Label>
                <Switch id="class-reminders" checked={classReminders} onCheckedChange={setClassReminders} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reminder-lead">Lead time (minutes)</Label>
                <Input
                  id="reminder-lead"
                  type="number"
                  min={1}
                  max={120}
                  className="w-28"
                  value={leadInput}
                  disabled={!classReminders}
                  onChange={(e) => setLeadInput(e.target.value)}
                  onBlur={() => {
                    const clamped = Math.min(120, Math.max(1, Number(leadInput) || 10))
                    setLeadInput(String(clamped))
                    setClassReminderLeadMinutes(clamped)
                  }}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Academic calendar</CardTitle>
          <CardDescription>
            Import an .ics from your institution (or a classmate's export) to fill in holidays, exam dates, or a
            whole timetable. Look for the <span className="font-medium">Import .ics</span> button on the{' '}
            <Link to="/calendar" className="underline">
              Calendar
            </Link>
            ,{' '}
            <Link to="/exams" className="underline">
              Exams
            </Link>
            , and{' '}
            <Link to="/timetable" className="underline">
              Timetable
            </Link>{' '}
            pages. Nothing is added until you review and confirm it.
          </CardDescription>
        </CardHeader>
      </Card>

      <CollapsibleSection
        title="Advanced settings"
        summary="Custom accent color, ESPRO sync, auto-backup location"
      >
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Custom accent color</CardTitle>
              <CardDescription>Overrides the theme pack's accent with your own color. Leave blank to use the pack as picked above.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  aria-label="Pick a custom accent color"
                  className="h-9 w-12 cursor-pointer rounded-md border border-input bg-transparent p-1"
                  value={isValidHexColor(accentColorInput) ? accentColorInput : '#2a78d6'}
                  onChange={(e) => handleAccentColorPicker(e.target.value)}
                />
                <Input
                  id="accent-color"
                  className="w-32 font-mono"
                  value={accentColorInput}
                  onChange={(e) => setAccentColorInput(e.target.value)}
                  onBlur={commitAccentColorText}
                  placeholder="#2a78d6"
                />
                {accentColor && (
                  <Button type="button" variant="outline" size="sm" onClick={clearAccentColor}>
                    Clear
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Auto-backup location</CardTitle>
              <CardDescription>
                How often BunkMate saves a copy of your data automatically, and where. Pointing this at a folder
                synced by OneDrive/Google Drive/Dropbox gives you an off-device (cloud) backup for free — each
                snapshot just gets uploaded like any other file. This is a periodic copy, not live shared access:
                don't point two installs of BunkMate at the same live database file at once, since SQLite isn't
                built to have two processes writing to it through a sync client at the same time.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end gap-3">
              <div className="space-y-2">
                <Label htmlFor="backup-interval">Auto-backup every (days)</Label>
                <Input
                  id="backup-interval"
                  type="number"
                  min={1}
                  className="w-28"
                  value={intervalInput}
                  onChange={(e) => setIntervalInput(e.target.value)}
                  onBlur={() => {
                    const clamped = Math.max(1, Number(intervalInput) || 1)
                    setIntervalInput(String(clamped))
                    setBackupIntervalDays(clamped)
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label>Auto-backup folder</Label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{backupDir ?? 'Not set'}</span>
                  <Button type="button" variant="outline" size="sm" onClick={handleChooseBackupDir}>
                    <FolderOpen /> Choose folder
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Crash log</CardTitle>
              <CardDescription>
                Off by default. When on, an unexpected error writes a small text log to this device, so a support
                report can include more than "it broke" — nothing is ever sent anywhere on its own.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <Switch id="crash-log" checked={crashLogEnabled} onCheckedChange={setCrashLogEnabled} />
                <Label htmlFor="crash-log" className="font-normal">
                  Save a local crash log
                </Label>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => window.bunkmate.crashLog.openFolder()}>
                <FolderOpen /> Open log folder
              </Button>
            </CardContent>
          </Card>

      <Card>
        <CardHeader>
          <CardTitle>ESPRO sync</CardTitle>
          <CardDescription>
            Optionally store your ESPRO login so BunkMate can compare its official attendance totals against your own
            on the <Link to="/dashboard" className="underline">Dashboard</Link>.{' '}
            <button type="button" className="underline" onClick={() => setEsproAboutOpen(true)}>
              About ESPRO sync &amp; your data
            </button>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {esproStatus === null ? (
            <p className="text-sm text-muted-foreground">Checking…</p>
          ) : !esproStatus.encryptionAvailable ? (
            // Part B5: never pretend we can encrypt when the OS can't.
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              <div className="space-y-1">
                <p className="font-medium">Secure storage unavailable on this device</p>
                <p className="text-muted-foreground">
                  Your operating system didn't provide a credential-encryption backend (safeStorage reported none), so
                  BunkMate won't store an ESPRO password it can't encrypt. ESPRO sync is disabled until this is
                  available.
                </p>
              </div>
            </div>
          ) : esproStatus.hasCredential ? (
            // Credential on record: show whose, never the password, and offer removal.
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <KeyRound className="size-4 text-success" />
                <span>
                  Stored for <span className="font-medium">{esproStatus.username ?? 'your account'}</span>, encrypted on
                  this device.
                </span>
              </div>
              <div className="space-y-2">
                <Label htmlFor="espro-session-id" className="flex items-center gap-1">
                  ESPRO session/term number
                  <HelpHint text="Tells ESPRO which academic term to pull attendance from. It usually stays the same for the whole semester once set." />
                </Label>
                <p className="text-sm text-muted-foreground">
                  Scopes the attendance comparison on the Dashboard. Found in the portal's Network tab, look for a{' '}
                  <code className="rounded bg-muted px-1">?sessionId=</code> query param on an attendance request.
                </p>
                <div className="flex gap-2">
                  <Input
                    id="espro-session-id"
                    className="max-w-32"
                    value={esproSessionIdInput}
                    onChange={(e) => setEsproSessionIdInput(e.target.value)}
                    placeholder="13"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSaveEsproSessionId}
                    disabled={esproSavingSessionId || esproSessionIdInput.trim() === (esproStatus.sessionId ?? '')}
                  >
                    Save
                  </Button>
                </div>
              </div>

              <p className="text-sm text-muted-foreground">
                Once a session number is saved, compare your attendance from the{' '}
                <Link to="/dashboard" className="underline">
                  Dashboard
                </Link>
                .
              </p>

              <Button type="button" variant="destructive" onClick={() => setEsproRemoveOpen(true)}>
                <Trash2 /> Remove ESPRO credentials
              </Button>
            </div>
          ) : (
            // No credential yet: gate the entry fields behind an explicit ack.
            <div className="space-y-4">
              <div className="rounded-md border bg-muted/30 p-3">
                <EsproDisclosure />
              </div>
              <label className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={esproAck}
                  onCheckedChange={(v) => setEsproAck(v === true)}
                />
                <span>I understand how my ESPRO login is stored and want to continue.</span>
              </label>

              <fieldset disabled={!esproAck} className="space-y-3 disabled:opacity-50">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="espro-username">ESPRO username / roll number</Label>
                    <Input
                      id="espro-username"
                      autoComplete="off"
                      value={esproUsername}
                      onChange={(e) => setEsproUsername(e.target.value)}
                      placeholder="2247xxx"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="espro-password">ESPRO password</Label>
                    <Input
                      id="espro-password"
                      type="password"
                      autoComplete="off"
                      value={esproPassword}
                      onChange={(e) => setEsproPassword(e.target.value)}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
                <Button
                  type="button"
                  onClick={handleEsproSave}
                  disabled={esproSaving || !esproUsername.trim() || !esproPassword}
                >
                  <KeyRound /> Save &amp; encrypt
                </Button>
              </fieldset>
            </div>
          )}
        </CardContent>
      </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-4" /> Danger zone
              </CardTitle>
              <CardDescription>
                Permanently deletes every semester, subject, timetable slot, attendance record, exam, holiday, leave
                plan, and yellow form — including sample data from "try it with sample data". Your appearance,
                notification, and ESPRO settings are kept. You can only get this back from a backup file, if you made
                one (Backup &amp; restore, above).
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button type="button" variant="destructive" onClick={() => setClearDataOpen(true)}>
                <Trash2 /> Clear all data
              </Button>
            </CardContent>
          </Card>

          <Dialog
            open={clearDataOpen}
            onOpenChange={(open) => {
              setClearDataOpen(open)
              if (!open) setClearDataText('')
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Clear all data?</DialogTitle>
                <DialogDescription>
                  This deletes every semester, subject, timetable slot, attendance record, exam, holiday, leave plan,
                  and yellow form on this device. There's no undo except restoring a backup. Type{' '}
                  <span className="font-mono font-medium text-foreground">DELETE</span> to confirm.
                </DialogDescription>
              </DialogHeader>
              <Input
                value={clearDataText}
                onChange={(e) => setClearDataText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
              />
              <DialogFooter>
                <Button variant="outline" onClick={() => setClearDataOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  disabled={clearingData || clearDataText !== 'DELETE'}
                  onClick={handleClearAllData}
                >
                  <Trash2 /> Clear all data
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={esproRemoveOpen} onOpenChange={setEsproRemoveOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Remove ESPRO credentials?</DialogTitle>
                <DialogDescription>
                  This permanently deletes the encrypted ESPRO login stored on this device. Attendance you've already
                  imported stays; you'll just need to re-enter your login to sync again. This can't be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setEsproRemoveOpen(false)}>
                  Cancel
                </Button>
                <Button variant="destructive" onClick={handleEsproRemove}>
                  <Trash2 /> Remove credentials
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <EsproAboutDialog open={esproAboutOpen} onOpenChange={setEsproAboutOpen} />
        </div>
      </CollapsibleSection>

      <Card>
        <CardHeader>
          <CardTitle>Backup &amp; restore</CardTitle>
          <CardDescription>
            All data lives in one local SQLite file. Back it up regularly: restoring overwrites it entirely. Auto-backup
            interval and folder are under Advanced settings above.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            {lastBackupAt ? `Last backup: ${new Date(lastBackupAt).toLocaleString()}` : 'No backup has been made yet.'}
          </p>

          <div className="flex gap-2">
            <Button type="button" onClick={handleBackupNow} disabled={backingUp}>
              <Save /> Backup now
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setRestoreConfirmOpen(true)}
              disabled={restoring}
            >
              <Upload /> Restore from backup
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={restoreConfirmOpen} onOpenChange={setRestoreConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore from backup?</DialogTitle>
            <DialogDescription>
              This replaces all current data with the chosen backup file and restarts the app. This cannot be
              undone, so make sure your current data is backed up first if you want to keep it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRestore}>
              Choose file &amp; restore
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
