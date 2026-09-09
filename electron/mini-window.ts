import { BrowserWindow } from 'electron'
import path from 'node:path'

const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL

let miniWindow: BrowserWindow | null = null

/**
 * A small always-on-top companion window — "what's next, what's my %"
 * without the full app in the way. Loads the SAME renderer bundle as the
 * main window (no second build to maintain) at the #/mini route, which
 * renders outside the normal AppShell (no sidebar/header) — see
 * src/pages/mini.tsx and its standalone route in App.tsx.
 */
export function toggleMiniWindow(): void {
  if (miniWindow) {
    miniWindow.close()
    return
  }

  miniWindow = new BrowserWindow({
    width: 300,
    height: 150,
    minWidth: 220,
    minHeight: 110,
    frame: false,
    alwaysOnTop: true,
    resizable: true,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  if (VITE_DEV_SERVER_URL) {
    miniWindow.loadURL(`${VITE_DEV_SERVER_URL}#/mini`)
  } else {
    miniWindow.loadFile(path.join(__dirname, '../dist/index.html'), { hash: '/mini' })
  }

  miniWindow.on('closed', () => {
    miniWindow = null
  })
}

export function isMiniWindowOpen(): boolean {
  return miniWindow !== null
}
