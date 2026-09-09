import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'

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
  try {
    const res = await autoUpdater.checkForUpdates()
    if (!res) {
      return { status: 'not-available' }
    }
    return {
      status: 'available',
      info: res.updateInfo,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { status: 'error', error: msg }
  }
}

export async function downloadUpdate(): Promise<void> {
  await autoUpdater.downloadUpdate()
}

export function quitAndInstall(): void {
  autoUpdater.quitAndInstall()
}
