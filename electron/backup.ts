import fs from 'node:fs'
import path from 'node:path'
import { getRawSqlite, getCurrentDbPath, closeDb } from './db/client'
import { settingsRepo } from './db/repositories'
import type { AppDatabase } from './db/client'

/**
 * Merges the WAL file into the main database file (so a plain file copy is a
 * complete, consistent snapshot) and copies it to destPath.
 */
export function backupNow(destPath: string): void {
  const sqlite = getRawSqlite()
  sqlite.pragma('wal_checkpoint(TRUNCATE)')
  fs.copyFileSync(getCurrentDbPath(), destPath)
}

export function defaultBackupFileName(): string {
  const now = new Date()
  const stamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  return `bunkmate-backup-${stamp}.db`
}

/**
 * Called on startup. If a backup directory is configured and the configured
 * interval has elapsed since the last backup (or none has ever run), backs
 * up silently and records the timestamp.
 */
export function runScheduledBackupIfDue(db: AppDatabase): void {
  const settings = settingsRepo.getSettings(db)
  if (!settings.backupDir) return

  const dueDate = settings.lastBackupAt
    ? new Date(settings.lastBackupAt.getTime() + settings.backupIntervalDays * 24 * 60 * 60 * 1000)
    : new Date(0)
  if (new Date() < dueDate) return

  if (!fs.existsSync(settings.backupDir)) fs.mkdirSync(settings.backupDir, { recursive: true })
  const destPath = path.join(settings.backupDir, defaultBackupFileName())
  backupNow(destPath)
  settingsRepo.updateSettings(db, { lastBackupAt: new Date() })
}

/**
 * Replaces the live database file with sourcePath. Closes the current
 * connection and removes any WAL/SHM sidecar files first so a stale WAL
 * can't get replayed against the restored file. The caller must relaunch
 * the app afterward — re-opening in place is not attempted.
 */
export function restoreFrom(sourcePath: string): void {
  const dbPath = getCurrentDbPath()
  closeDb()
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = dbPath + suffix
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar)
  }
  fs.copyFileSync(sourcePath, dbPath)
}
