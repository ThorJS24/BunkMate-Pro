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
}

function sendStatus(payload: UpdateStatusPayload) {
  if (mainWindowRef && !mainWindowRef.isDestroyed()) {
    mainWindowRef.webContents.send('updater:status', payload)
  }
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
    if (!res || !res.updateInfo) {
      const notAvailPayload: UpdateStatusPayload = { status: 'not-available' }
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
