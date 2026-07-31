import { describe, it, expect, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { initDb, closeDb, getDbPath } from './client'

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'bunkmate-client-test-'))
}

describe('initDb', () => {
  let userDataDir: string

  afterEach(() => {
    closeDb()
    try {
      if (userDataDir) fs.rmSync(userDataDir, { recursive: true, force: true })
    } catch {
      // Windows can briefly hold a handle open on a database that failed to
      // open cleanly; the OS temp-dir cleanup will catch it eventually.
    }
  })

  it('creates a fresh database and runs migrations', () => {
    userDataDir = makeTempDir()
    const db = initDb(userDataDir)
    expect(db).toBeTruthy()
    expect(fs.existsSync(getDbPath(userDataDir))).toBe(true)
  })

  it('throws instead of silently opening a corrupted database file', () => {
    userDataDir = makeTempDir()
    const dbPath = getDbPath(userDataDir)
    // A file that looks nothing like a SQLite database.
    fs.writeFileSync(dbPath, 'this is not a sqlite file, just plain garbage bytes')

    // The exact message depends on where SQLite rejects the file (its own
    // file-format check vs. our explicit integrity_check pragma) — either
    // way, it must throw rather than silently open a corrupted database.
    expect(() => initDb(userDataDir)).toThrow()
  })
})
