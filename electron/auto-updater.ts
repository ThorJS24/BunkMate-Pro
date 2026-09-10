import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { BrowserWindow, app } from 'electron'

export interface UpdateStatusPayload {
  status: 'idle' | 'checking' | 'available' | 'not-available' | 'downloading' | 'downloaded' | 'error'
  info?: UpdateInfo
  progress?: ProgressInfo
  error?: string
}

let mainWindowRef: BrowserWindow | null = null

export function initAutoUpdater(mainWindow: BrowserWindow) {
  mainWindowRef = mainWindow

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true
  autoUpdater.logger = console

  try {
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'ThorJS24',
      repo: 'BunkMate-Pro',
    })
  } catch (err) {
    console.error('[AutoUpdater] Feed URL set error:', err)
  }

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    sendStatus({ status: 'available', info })
  })

  autoUpdater.on('update-not-available', (info) => {
    sendStatus({ status: 'not-available', info })
  })

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({ status: 'downloading', progress })
  })

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({ status: 'downloaded', info })
  })

  autoUpdater.on('error', (err) => {
    sendStatus({ status: 'error', error: err ? err.message : 'Unknown updater error' })
  })

  // Schedule auto-check 10 seconds after startup
  setTimeout(() => {
    checkForUpdates().catch((err) => console.error('[AutoUpdater] Initial check error:', err))
  }, 10_000)

  // Schedule periodic check every 6 hours
  setInterval(() => {
    checkForUpdates().catch((err) => console.error('[AutoUpdater] Periodic check error:', err))
  }, 6 * 60 * 60 * 1000)
}

function sendStatus(payload: UpdateStatusPayload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status', payload)
  }
}

function isHigherVersion(remote: string, current: string): boolean {
  const parse = (v: string) => v.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const [rMajor = 0, rMinor = 0, rPatch = 0] = parse(remote)
  const [cMajor = 0, cMinor = 0, cPatch = 0] = parse(current)
  if (rMajor !== cMajor) return rMajor > cMajor
  if (rMinor !== cMinor) return rMinor > cMinor
  return rPatch > cPatch
}

export async function checkForUpdates(): Promise<UpdateStatusPayload> {
  sendStatus({ status: 'checking' })
  if (!app.isPackaged) {
    const devPayload: UpdateStatusPayload = {
      status: 'not-available',
      error: `Running in development mode (v${app.getVersion()}). Auto-updater is active in production builds.`,
    }
    sendStatus(devPayload)
    return devPayload
  }

  try {
    const res = await autoUpdater.checkForUpdates()
    if (!res || !res.updateInfo || !isHigherVersion(res.updateInfo.version, app.getVersion())) {
      const notAvailPayload: UpdateStatusPayload = {
        status: 'not-available',
        error: `You are running the latest version of BunkMate Pro (v${app.getVersion()}).`,
      }
      sendStatus(notAvailPayload)
      return notAvailPayload
    }
    const availPayload: UpdateStatusPayload = {
      status: 'available',
      info: res.updateInfo,
    }
    sendStatus(availPayload)
    return availPayload
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const errPayload: UpdateStatusPayload = { status: 'error', error: msg }
    sendStatus(errPayload)
    return errPayload
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
