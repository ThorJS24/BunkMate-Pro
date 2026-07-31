import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import Database from 'better-sqlite3'
import { initDb, closeDb, getCurrentDbPath } from './db/client'
import { subjectsRepo, settingsRepo } from './db/repositories'
import { backupNow, restoreFrom, runScheduledBackupIfDue, defaultBackupFileName } from './backup'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bunkmate-backup-test-'))
}

describe('backupNow', () => {
  let userDataDir: string
  let backupDestDir: string

  beforeEach(() => {
    userDataDir = makeTempDir()
    backupDestDir = makeTempDir()
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(backupDestDir, { recursive: true, force: true })
  })

  it('checkpoints the WAL and copies a complete, readable snapshot', () => {
    const db = initDb(userDataDir)
    subjectsRepo.createSubject(db, { name: 'Data Structures', semester: '2026-1', credits: 4, faculty: null, category: null })

    const destPath = path.join(backupDestDir, 'snapshot.db')
    backupNow(destPath)

    expect(fs.existsSync(destPath)).toBe(true)
    const copy = new Database(destPath, { readonly: true })
    const rows = copy.prepare('select name from subjects').all() as { name: string }[]
    expect(rows).toEqual([{ name: 'Data Structures' }])
    copy.close()
  })
})

describe('runScheduledBackupIfDue', () => {
  let userDataDir: string
  let backupDir: string

  beforeEach(() => {
    userDataDir = makeTempDir()
    backupDir = makeTempDir()
  })

  afterEach(() => {
    closeDb()
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(backupDir, { recursive: true, force: true })
  })

  it('does nothing when no backup directory is configured', () => {
    const db = initDb(userDataDir)
    runScheduledBackupIfDue(db)
    expect(fs.readdirSync(backupDir)).toEqual([])
  })

  it('backs up immediately when one has never run, and records the timestamp', () => {
    const db = initDb(userDataDir)
    settingsRepo.updateSettings(db, { backupDir, backupIntervalDays: 7 })

    runScheduledBackupIfDue(db)

    const files = fs.readdirSync(backupDir)
    expect(files).toHaveLength(1)
    expect(settingsRepo.getSettings(db).lastBackupAt).not.toBeNull()
  })

  it('skips when the interval has not yet elapsed', () => {
    const db = initDb(userDataDir)
    settingsRepo.updateSettings(db, { backupDir, backupIntervalDays: 7, lastBackupAt: new Date() })

    runScheduledBackupIfDue(db)

    expect(fs.readdirSync(backupDir)).toEqual([])
  })

  it('runs again once the interval has elapsed', () => {
    const db = initDb(userDataDir)
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000)
    settingsRepo.updateSettings(db, { backupDir, backupIntervalDays: 7, lastBackupAt: eightDaysAgo })

    runScheduledBackupIfDue(db)

    expect(fs.readdirSync(backupDir)).toHaveLength(1)
  })
})

describe('restoreFrom', () => {
  let userDataDir: string
  let sourceDir: string

  beforeEach(() => {
    userDataDir = makeTempDir()
    sourceDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true })
    fs.rmSync(sourceDir, { recursive: true, force: true })
  })

  it('replaces the live DB file with the source and clears stale WAL/SHM sidecars', () => {
    const db = initDb(userDataDir)
    const dbPath = getCurrentDbPath()
    subjectsRepo.createSubject(db, { name: 'Original', semester: '2026-1', credits: 3, faculty: null, category: null })

    // Build a distinct "backup" file to restore from.
    const sourcePath = path.join(sourceDir, 'backup.db')
    const sourceDb = new Database(sourcePath)
    sourceDb.pragma('journal_mode = WAL')
    sourceDb.exec('CREATE TABLE subjects (id INTEGER PRIMARY KEY, name TEXT)')
    sourceDb.prepare('INSERT INTO subjects (name) VALUES (?)').run('Restored')
    sourceDb.pragma('wal_checkpoint(TRUNCATE)')
    sourceDb.close()

    restoreFrom(sourcePath)

    expect(fs.existsSync(dbPath + '-wal')).toBe(false)
    expect(fs.existsSync(dbPath + '-shm')).toBe(false)
    const restored = new Database(dbPath, { readonly: true })
    const rows = restored.prepare('select name from subjects').all() as { name: string }[]
    expect(rows).toEqual([{ name: 'Restored' }])
    restored.close()
  })
})

describe('defaultBackupFileName', () => {
  it('produces a .db filename with no invalid path characters', () => {
    const name = defaultBackupFileName()
    expect(name).toMatch(/^bunkmate-backup-[0-9T-]+\.db$/)
    expect(name).not.toMatch(/[:]/)
  })
})
