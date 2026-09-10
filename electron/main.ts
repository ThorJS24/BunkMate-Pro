import { app, BrowserWindow, dialog } from 'electron'
import path from 'node:path'
import { initDb, closeDb, getDbPath } from './db/client'
import { registerIpcHandlers } from './ipc/register'
import { settingsRepo, periodTypeRulesRepo, semestersRepo } from './db/repositories'
import { runScheduledBackupIfDue } from './backup'
import { startClassReminders } from './reminders'
import { createTray } from './tray'
import { initCrashLogging } from './crash-log'
import { startEsproBackgroundAutoSync } from './espro/auto-sync'
import { initAutoUpdater } from './auto-updater'

let stopEsproAutoSync: (() => void) | null = null

// Register custom protocol handler bunkmate://
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('bunkmate', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('bunkmate')
}

// Enforce a single instance lock so launching BunkMate twice focuses the existing window
// instead of launching a second process that conflicts on the SQLite database lock.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, commandLine) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
    const deepLinkUrl = commandLine.find((arg) => arg.startsWith('bunkmate://'))
    if (deepLinkUrl && mainWindow) {
      mainWindow.webContents.send('bunkmate:deeplink', deepLinkUrl)
    }
  })
}

// Windows shows native notifications under this identity; without it, toasts
// from a dev/unsigned build may be suppressed or mis-attributed.
if (process.platform === 'win32') app.setAppUserModelId('com.bunkmate.pro')

let stopReminders: (() => void) | null = null
let tray: ReturnType<typeof createTray> | null = null
// The window's close button hides to the tray so the tray stays useful and
// reminders keep running; only an explicit Quit (tray menu / app quit) really
// exits. This flag lets the close handler tell the two apart.
let isQuitting = false

// Populated by vite-plugin-electron during `npm run dev`.
const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(VITE_DEV_SERVER_URL)
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('close', (e) => {
    // Close = hide to tray, unless we're genuinely quitting.
    if (!isQuitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  // Cheap way to keep the tray % fresh without wiring it through every IPC
  // mutation: refresh whenever the window hides (user just did work then
  // closed to tray) or regains focus.
  mainWindow.on('hide', () => tray?.refresh())
  mainWindow.on('focus', () => tray?.refresh())

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// College Wi-Fi / SSL Inspection handling:
// Campus Wi-Fi networks (Fortinet, Sophos, Cisco) use custom Root CAs for SSL inspection.
// Electron's net module uses Windows OS Certificate Store, and certificate-error handles
// campus certificates for Christ University endpoints seamlessly.
app.on('certificate-error', (event, _webContents, url, _error, _certificate, callback) => {
  if (
    url.includes('christuniversity.in') ||
    url.includes('espro.christuniversity.in') ||
    url.includes('studentespro.christuniversity.in') ||
    url.includes('cue.christuniversity.in')
  ) {
    event.preventDefault()
    callback(true)
    return
  }
  callback(false)
})

app.whenReady().then(() => {
  const userDataDir = app.getPath('userData')

  let db
  try {
    db = initDb(userDataDir)
  } catch (error) {
    const dbPath = getDbPath(userDataDir)
    dialog.showErrorBox(
      'BunkMate Pro: database problem',
      `The local database at\n${dbPath}\nfailed its integrity check and could not be opened safely.\n\n` +
        `To recover: close this dialog, then replace that file with a backup copy ` +
        `(Settings → Backup & restore, or the backup folder if auto-backup was on) and relaunch.\n\n` +
        `Details: ${error instanceof Error ? error.message : String(error)}`,
    )
    app.exit(1)
    return
  }

  settingsRepo.ensureSettingsRow(db)
  periodTypeRulesRepo.ensureDefaultPeriodTypeRules(db)
  semestersRepo.ensureSemestersSeeded(db)

  // A plain mutable flag, not a DB read on every crash: initCrashLogging's
  // handler runs in exactly the moment something has already gone wrong, so
  // it shouldn't risk a second failure querying a database that may itself
  // be implicated. registerIpcHandlers keeps this in sync whenever the
  // setting changes via Settings.
  const crashLogState = { enabled: settingsRepo.getSettings(db).crashLogEnabled }
  initCrashLogging(userDataDir, () => crashLogState.enabled)

  // While active (a running Pomodoro work session — see the renderer's
  // PomodoroTimer), class/exam reminders skip firing rather than queueing.
  const focusModeState = { active: false }

  registerIpcHandlers(db, userDataDir, crashLogState, () => mainWindow, focusModeState)
  runScheduledBackupIfDue(db)
  stopReminders = startClassReminders(db, focusModeState)
  stopEsproAutoSync = startEsproBackgroundAutoSync(db, userDataDir, () => mainWindow)
  tray = createTray(
    db,
    () => mainWindow,
    () => {
      isQuitting = true
    },
  )
  createWindow()
  if (mainWindow) {
    initAutoUpdater(mainWindow)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else mainWindow?.show()
  })
})

app.on('before-quit', () => {
  isQuitting = true
})

app.on('window-all-closed', () => {
  // Only reached on a real quit (close-to-tray keeps the window alive), so
  // it's safe to tear everything down here.
  stopReminders?.()
  stopReminders = null
  stopEsproAutoSync?.()
  stopEsproAutoSync = null
  tray?.destroy()
  tray = null
  closeDb()
  if (process.platform !== 'darwin') app.quit()
})
