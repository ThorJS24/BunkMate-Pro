import { Tray, Menu, nativeImage, app, type BrowserWindow } from 'electron'
import type { AppDatabase } from './db/client'
import { computeOverallSummary } from './attendance-summary'

// 16x16 ink-blue tray icon (generated PNG; see the git history for how). Kept
// inline so there's no runtime asset path to resolve differently in dev vs a
// packaged build.
const TRAY_ICON_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAALklEQVR4nGNggAI9++z/pGAGdEC2AaRqxDBo1IBhZ0DXgntE4UFsAFlhMOC5EQCwTt1AH5eb1AAAAABJRU5ErkJggg=='

const REFRESH_MS = 60_000

function formatPercent(pct: number | null): string {
  return pct === null ? '—' : `${pct.toFixed(1)}%`
}

/**
 * Lightweight system tray: shows the live overall attendance % (tooltip +
 * a disabled context-menu header), left-click restores/focuses the window,
 * and the menu offers Open / Quit. Reads the shared computeOverallSummary()
 * rather than duplicating any dashboard logic. `onQuit` lets main flip its
 * "really quitting" flag so the window's close-to-tray handler stands aside.
 */
export function createTray(
  db: AppDatabase,
  getWindow: () => BrowserWindow | null,
  onQuit: () => void,
): { refresh: () => void; destroy: () => void } {
  const icon = nativeImage.createFromDataURL(`data:image/png;base64,${TRAY_ICON_BASE64}`)
  const tray = new Tray(icon)

  function showWindow() {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  }

  function refresh() {
    let pct: number | null = null
    let attended = 0
    let total = 0
    try {
      const summary = computeOverallSummary(db)
      pct = summary.percentage
      attended = summary.attended
      total = summary.total
    } catch {
      // A read failure shouldn't blank the tray — leave the last-known label.
    }

    tray.setToolTip(`BunkMate — ${formatPercent(pct)} overall`)
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: `Overall attendance: ${formatPercent(pct)}`, enabled: false },
        { label: `${attended} / ${total} periods`, enabled: false },
        { type: 'separator' },
        { label: 'Open BunkMate', click: showWindow },
        {
          label: 'Quit',
          click: () => {
            onQuit()
            app.quit()
          },
        },
      ]),
    )
  }

  tray.on('click', showWindow)
  refresh()
  const interval = setInterval(refresh, REFRESH_MS)

  return {
    refresh,
    destroy: () => {
      clearInterval(interval)
      tray.destroy()
    },
  }
}
