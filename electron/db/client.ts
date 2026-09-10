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

  try {
    sqlite.pragma('optimize')
    sqlite.pragma('reindex')
  } catch (optErr) {
    console.warn('SQLite optimize/reindex notice:', optErr)
  }

  sqliteInstance = sqlite
  currentDbPath = dbPath
  const db = drizzle(sqlite, { schema })

  const migrationsFolder = path.join(__dirname, 'migrations')
  if (fs.existsSync(migrationsFolder)) {
    migrate(db, { migrationsFolder })
  }

  // Fallback check to ensure espro_auto_yellow_forms column exists in user's SQLite db
  try {
    const tableInfo = sqlite.pragma('table_info(settings)') as Array<{ name: string }>
    if (tableInfo.length > 0 && !tableInfo.some((col) => col.name === 'espro_auto_yellow_forms')) {
      sqlite.exec('ALTER TABLE settings ADD COLUMN espro_auto_yellow_forms INTEGER NOT NULL DEFAULT 1;')
    }
    // Update lunch_period to 5 (1:00 PM - 2:00 PM) for semesters previously defaulted to period 4
    sqlite.exec("UPDATE semesters SET lunch_period = 5 WHERE lunch_period = 4;")
    sqlite.exec("UPDATE timetable_slots SET type = 'class' WHERE period = 4 AND type = 'lunch';")
    sqlite.exec("UPDATE timetable_slots SET type = 'lunch' WHERE period = 5 AND type = 'class';")
    // Automatically deduplicate any legacy duplicate attendance records or timetable slots
    sqlite.exec('DELETE FROM attendance_records WHERE id NOT IN (SELECT MIN(id) FROM attendance_records GROUP BY date, period, subject_id);')
    sqlite.exec('DELETE FROM timetable_slots WHERE id NOT IN (SELECT MIN(id) FROM timetable_slots GROUP BY semester, day, period);')
  } catch (err) {
    console.error('Failed fallback schema checks:', err)
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
