import type { BrowserWindow } from 'electron'
import type { AppDatabase } from '../db/client'
import { loadEsproCredential } from './credential-store'
import { esproAutoImportFullStudentData } from './sync'
import { semestersRepo } from '../db/repositories'

const AUTO_SYNC_INTERVAL_MS = 30 * 60 * 1000 // 30 minutes

let autoSyncTimer: NodeJS.Timeout | null = null

export function startEsproBackgroundAutoSync(
  db: AppDatabase,
  userDataDir: string,
  getMainWindow: () => BrowserWindow | null,
): () => void {
  async function runAutoSync() {
    const creds = loadEsproCredential(userDataDir)
    if (!creds) return // No credentials stored; skip background sync silently

    const currentSemester =
      semestersRepo.listSemesters(db).find((s) => s.isActive) ||
      semestersRepo.listSemesters(db)[0]
    if (!currentSemester) return

    try {
      const result = await esproAutoImportFullStudentData(db, userDataDir, currentSemester.label)
      const mainWindow = getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('espro:autoSynced', result)
      }
    } catch {
      // Ignore background network/auth errors silently to avoid disturbing the student
    }
  }

  // Initial sync attempt 15 seconds after app launch
  const initialTimer = setTimeout(() => {
    runAutoSync()
  }, 15_000)

  // Periodic interval every 30 minutes
  autoSyncTimer = setInterval(() => {
    runAutoSync()
  }, AUTO_SYNC_INTERVAL_MS)

  return () => {
    clearTimeout(initialTimer)
    if (autoSyncTimer) clearInterval(autoSyncTimer)
  }
}
