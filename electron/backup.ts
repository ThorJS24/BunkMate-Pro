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

// The first 16 bytes of every valid SQLite file, always. Checked before
// touching the live database, so picking the wrong file (a random .db-named
// file, a truncated copy) fails loudly up front instead of silently
// replacing good data with garbage that only surfaces as "nothing changed"
// or worse once the app relaunches against it.
const SQLITE_MAGIC = 'SQLite format 3\0'

function looksLikeSqliteFile(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r')
  try {
    const buf = Buffer.alloc(16)
    const bytesRead = fs.readSync(fd, buf, 0, 16, 0)
    return bytesRead === 16 && buf.toString('latin1') === SQLITE_MAGIC
  } finally {
    fs.closeSync(fd)
  }
}

/**
 * Replaces the live database file with sourcePath. Closes the current
 * connection and removes any WAL/SHM sidecar files first so a stale WAL
 * can't get replayed against the restored file. The caller must relaunch
 * the app afterward — re-opening in place is not attempted.
 *
 * Validates sourcePath actually looks like a SQLite file BEFORE closing the
 * live connection or touching anything — a bad pick should fail loudly with
 * the live database still intact and still open, not leave the app in a
 * half-torn-down state.
 */
export function restoreFrom(sourcePath: string): void {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Backup file not found: ${sourcePath}`)
  }
  if (!looksLikeSqliteFile(sourcePath)) {
    throw new Error(
      `"${sourcePath.split(/[\\/]/).pop()}" doesn't look like a valid BunkMate backup file (wrong file format).`,
    )
  }

  const dbPath = getCurrentDbPath()
  closeDb()
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = dbPath + suffix
    if (fs.existsSync(sidecar)) fs.rmSync(sidecar)
  }
  fs.copyFileSync(sourcePath, dbPath)
}
