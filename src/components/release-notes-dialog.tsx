import { useState, useEffect } from 'react'
import { Sparkles, CheckCircle2, Download, RefreshCw, Calendar, ShieldCheck, Laptop, Monitor, Terminal, Zap, Package } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

interface ReleaseNotesDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const RELEASE_ASSETS = [
  { name: 'BunkMate Pro Setup 2.1.2.exe', platform: 'Windows', type: 'NSIS Installer', desc: 'Full installer with tray & protocol handler' },
  { name: 'BunkMate Pro Portable 2.1.2.exe', platform: 'Windows', type: 'Portable Executable', desc: 'Zero-install standalone exe for USB or PC' },
  { name: 'BunkMate Pro 2.1.2-x64.dmg', platform: 'macOS', type: 'DMG Package', desc: 'Native macOS disk image installer' },
  { name: 'BunkMate Pro 2.1.2-mac.app.zip', platform: 'macOS', type: 'Portable .app Zip', desc: 'Standalone .app bundle for macOS' },
  { name: 'BunkMate Pro 2.1.2-x86_64.AppImage', platform: 'Linux', type: 'Universal AppImage', desc: 'Universal Linux portable binary (All Distros)' },
  { name: 'BunkMate Pro 2.1.2-amd64.deb', platform: 'Linux', type: 'Debian/Ubuntu Package', desc: 'Native .deb package for Ubuntu/Debian' },
  { name: 'BunkMate Pro Universal Portable 2.1.2.zip', platform: 'Cross-Platform', type: 'All-in-One Universal', desc: 'Single universal zip for Windows, Mac & Linux' },
  { name: 'latest.yml / latest-mac.yml', platform: 'Auto-Updater', type: 'Update Manifest', desc: 'Electron auto-updater manifests for background sync' },
]

const RELEASE_HISTORY = [
  {
    version: 'v2.1.2',
    date: '2026-09-10',
    title: 'Multi-Platform Production Build with Auto-Updater, Cloud Backup & Exam Simulator',
    current: true,
    highlights: [
      '🚀 Single Universal Portable Package: One zip file containing zero-install auto-detect launchers for Windows, macOS, and Linux.',
      '🚀 In-App Automatic Updater: Automatic background update checks via GitHub Releases with silent in-app downloading, real-time progress bar, and 1-click restart.',
      '☁️ Cloud Auto-Backup Manager: Automatic local/cloud snapshot folder detector (OneDrive, Google Drive, Dropbox) with daily/weekly schedules & 1-click restore.',
      '🎓 Exam Eligibility Simulator: Projects final end-of-semester attendance for every subject, highlighting Hall Ticket issuance (≥85%), Condonation (75-84%), or Withheld status (<75%).',
      '🐛 Built-In Bug & Issue Reporting System: Submit bug reports and feature requests with media attachments (screenshots/logs), system diagnostics, comment threads, and Markdown export.',
      '🔐 1-Click ESPRO Auto-Sync: Auto-scrape official CHRIST University attendance, credit hours, and day-wise attendance directly from Keycloak portal.',
      '🧹 Database Maintenance Suite: SQLite WAL defragmentation, index optimization, and real-time database storage inspection.',
      '🎛️ 100% Sizing & Drag Flexibility: Fully customizable grid layout for Today & Dashboard pages with 8-direction resizing.',
    ],
  },
  {
    version: 'v2.1.0',
    date: '2026-09-05',
    title: 'Initial Multi-Platform BunkMate Pro Desktop Release',
    highlights: [
      '📌 Desktop Companion Mini Window: Always-on-top compact window showing current period and aggregate %.',
      '⏲️ Pomodoro Focus Widget: Integrated work/study timer with notification suppression.',
      '📑 OCR Hall Ticket & PDF Parser: Extract exam dates, timings, and course codes automatically from PDF files.',
      '🔒 100% Offline & Local Encryption: Zero telemetry, local SQLite database encrypted with Windows safeStorage.',
    ],
  },
]

export function ReleaseNotesDialog({ open, onOpenChange }: ReleaseNotesDialogProps) {
  const [updateStatus, setUpdateStatus] = useState<{
    status: string
    info?: any
    progress?: any
    error?: string
  }>({ status: 'idle' })
  const [checking, setChecking] = useState(false)

  const currentVersion = window.bunkmate?.versions?.app || '2.1.2'
  const remoteVersion = (updateStatus.info as any)?.version ? `v${(updateStatus.info as any).version}` : null

  useEffect(() => {
    if (!open) return
    if (window.bunkmate?.updater?.onStatusChange) {
      return window.bunkmate.updater.onStatusChange((payload: any) => {
        setUpdateStatus(payload)
      })
    }
  }, [open])

  async function handleCheckUpdate() {
    if (!window.bunkmate?.updater) return
    setChecking(true)
    try {
      const res = await window.bunkmate.updater.checkForUpdates()
      setUpdateStatus(res as any)
    } finally {
      setChecking(false)
    }
  }

  async function handleDownload() {
    if (!window.bunkmate?.updater) return
    try {
      await window.bunkmate.updater.downloadUpdate()
    } catch (err) {
      setUpdateStatus({ status: 'error', error: String(err) })
    }
  }

  function handleInstall() {
    if (!window.bunkmate?.updater) return
    window.bunkmate.updater.quitAndInstall()
  }

  function handleOpenGitHubReleases() {
    window.open('https://github.com/ThorJS24/BunkMate-Pro/releases', '_blank')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between text-xl">
            <span className="flex items-center gap-2">
              <Sparkles className="size-5 text-amber-500" /> BunkMate Pro Release Hub & Multi-Platform Assets
            </span>
            <Badge variant="outline" className="font-mono text-xs">
              v{currentVersion} Installed
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Multi-platform releases (Windows, macOS, Linux & Universal Portable), auto-updater, and release manifests.
          </DialogDescription>
        </DialogHeader>

        {/* Top Version Comparison Panel */}
        <div className="rounded-xl border p-4 bg-muted/20 space-y-3 shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border p-3 bg-card/70 space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">Installed Version</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-foreground">v{currentVersion}</span>
                <Badge variant="secondary" className="text-[10px] px-2 py-0.5">Active</Badge>
              </div>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                <ShieldCheck className="size-3 text-emerald-500" /> Multi-Platform Production Build
              </p>
            </div>

            <div className="rounded-lg border p-3 bg-card/70 space-y-1">
              <span className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider block">Latest Online Release</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-lg font-bold text-foreground">
                  {remoteVersion ? remoteVersion : updateStatus.status === 'not-available' ? `v${currentVersion}` : 'Checking...'}
                </span>
                {updateStatus.status === 'available' ? (
                  <Badge variant="default" className="text-[10px] bg-amber-500 text-white px-2 py-0.5">New Update Available!</Badge>
                ) : updateStatus.status === 'downloaded' ? (
                  <Badge variant="default" className="text-[10px] bg-emerald-600 text-white px-2 py-0.5">Ready to Install</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] px-2 py-0.5">Up to Date</Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {updateStatus.status === 'available'
                  ? `Version ${remoteVersion} is ready to download.`
                  : updateStatus.status === 'downloaded'
                    ? 'Update downloaded. Click Restart & Install.'
                    : updateStatus.status === 'not-available'
                      ? 'Your app is up to date with GitHub Releases.'
                      : 'Click Check for Updates to verify online releases.'}
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between pt-1 border-t">
            <span className="text-xs text-muted-foreground font-mono">
              {updateStatus.status === 'checking'
                ? 'Checking GitHub Releases...'
                : updateStatus.status === 'downloading'
                  ? `Downloading update: ${(updateStatus.progress?.percent || 0).toFixed(1)}%`
                  : updateStatus.error || 'Auto-updater active.'}
            </span>

            <div className="flex items-center gap-2">
              {updateStatus.status === 'downloaded' ? (
                <Button size="sm" onClick={handleInstall} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                  <CheckCircle2 className="size-3.5 mr-1.5" /> Restart & Install
                </Button>
              ) : updateStatus.status === 'available' ? (
                <Button size="sm" onClick={handleDownload}>
                  <Download className="size-3.5 mr-1.5" /> Download Update
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleCheckUpdate} disabled={checking}>
                  <RefreshCw className={`size-3.5 mr-1.5 ${checking ? 'animate-spin' : ''}`} />
                  {checking ? 'Checking...' : 'Check for Updates'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Tabbed View: All Multi-Platform Assets vs Changelog */}
        <Tabs defaultValue="assets" className="flex-1 flex flex-col min-h-0 mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="assets">Release Assets (Windows, Mac, Linux, Portable)</TabsTrigger>
            <TabsTrigger value="changelog">Changelog & Release Notes</TabsTrigger>
          </TabsList>

          <TabsContent value="assets" className="flex-1 overflow-y-auto space-y-3 pt-3 pr-1">
            {/* HERO FLAGSHIP UNIVERSAL PORTABLE */}
            <div className="rounded-xl border-2 border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-foreground flex items-center gap-2">
                      BunkMate Pro Universal Portable 2.1.2.zip
                      <Badge variant="default" className="bg-emerald-600 text-[10px]">All-in-One Portable</Badge>
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Single universal portable package running natively on <strong>Windows, macOS, and Linux</strong> without installation.
                    </p>
                  </div>
                </div>
                <Button size="default" onClick={handleOpenGitHubReleases} className="gap-1.5 font-semibold">
                  <Download className="h-4 w-4" /> Download Universal
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-primary/20 text-xs">
                <div className="flex items-center gap-2 rounded-md bg-background/60 p-2 font-mono">
                  <Monitor className="h-4 w-4 text-blue-500 shrink-0" />
                  <span>Windows 10/11 (Auto-Detect)</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-background/60 p-2 font-mono">
                  <Laptop className="h-4 w-4 text-purple-500 shrink-0" />
                  <span>macOS Intel & Apple Silicon</span>
                </div>
                <div className="flex items-center gap-2 rounded-md bg-background/60 p-2 font-mono">
                  <Terminal className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span>Linux (Ubuntu/Fedora/Arch)</span>
                </div>
              </div>
            </div>

            {/* FULL MULTI-PLATFORM ASSETS MATRIX */}
            <div className="rounded-lg border bg-card/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5" /> Complete Platform Asset Matrix
                </span>
                <Badge variant="outline" className="text-[10px]">8 Files Total</Badge>
              </div>
              <div className="space-y-1.5 pt-1">
                {RELEASE_ASSETS.map((asset) => (
                  <div key={asset.name} className="flex items-center justify-between rounded-md border bg-background/50 p-2 text-xs">
                    <div className="flex items-center gap-2 truncate pr-2">
                      {asset.platform === 'Windows' && <Monitor className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                      {asset.platform === 'macOS' && <Laptop className="h-3.5 w-3.5 text-purple-500 shrink-0" />}
                      {asset.platform === 'Linux' && <Terminal className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                      {asset.platform === 'Cross-Platform' && <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                      {asset.platform === 'Auto-Updater' && <RefreshCw className="h-3.5 w-3.5 text-sky-500 shrink-0" />}
                      <div>
                        <span className="font-semibold font-mono text-[11px] block">{asset.name}</span>
                        <span className="text-[10px] text-muted-foreground">{asset.desc} • {asset.type}</span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={handleOpenGitHubReleases}>
                      <Download className="h-3 w-3 mr-1" /> Get
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          <TabsContent value="changelog" className="flex-1 overflow-y-auto space-y-4 pt-3 pr-1">
            {RELEASE_HISTORY.map((rel) => (
              <div
                key={rel.version}
                className={`rounded-xl border p-4 space-y-3 transition-colors ${
                  rel.version === `v${currentVersion}`
                    ? 'border-primary/40 bg-primary/5'
                    : 'bg-card/60'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-base font-bold text-foreground">{rel.version}</span>
                    {rel.version === `v${currentVersion}` && (
                      <Badge variant="default" className="text-[10px] px-2 py-0.5">
                        Installed on this device
                      </Badge>
                    )}
                  </div>
                  <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                    <Calendar className="size-3" /> {rel.date}
                  </span>
                </div>

                <h4 className="text-sm font-semibold text-foreground">{rel.title}</h4>

                <ul className="space-y-1.5">
                  {rel.highlights.map((item, idx) => (
                    <li key={idx} className="text-xs text-muted-foreground leading-relaxed flex items-start gap-2">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
