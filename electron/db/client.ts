import path from 'node:path'
import fs from 'node:fs'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { schema } from '../../src/db/schema'

export type AppDatabase = ReturnType<typeof drizzle<typeof schema>>

let dbInstance: AppDatabase | null = null
let sqliteInstance: Database.Database | null = null
let currentDbPath: string | null = null

export function getDbPath(userDataDir: string): string {
  return path.join(userDataDir, 'bunkmate.db')
}

export function initDb(userDataDir: string): AppDatabase {
  if (dbInstance) return dbInstance

  if (!fs.existsSync(userDataDir)) {
    fs.mkdirSync(userDataDir, { recursive: true })
  }

  const dbPath = getDbPath(userDataDir)
  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')

  const integrityResult = sqlite.pragma('integrity_check') as { integrity_check: string }[]
  if (integrityResult[0]?.integrity_check !== 'ok') {
    throw new Error(`SQLite integrity check failed for ${dbPath}: ${JSON.stringify(integrityResult)}`)
  }

  sqliteInstance = sqlite
  currentDbPath = dbPath
  const db = drizzle(sqlite, { schema })

  const migrationsFolder = path.join(__dirname, 'migrations')
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder })
  }

  dbInstance = db
  return db
}

export function closeDb(): void {
  sqliteInstance?.close()
  sqliteInstance = null
  dbInstance = null
}

export function getRawSqlite(): Database.Database {
  if (!sqliteInstance) throw new Error('Database not initialized')
  return sqliteInstance
}

export function getCurrentDbPath(): string {
  if (!currentDbPath) throw new Error('Database not initialized')
  return currentDbPath
}
