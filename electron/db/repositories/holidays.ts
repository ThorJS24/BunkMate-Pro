import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { holidays } from '../../../src/db/schema'

export type Holiday = typeof holidays.$inferSelect
export type NewHoliday = Omit<typeof holidays.$inferInsert, 'id' | 'createdAt'>
export type HolidayUpdate = Partial<NewHoliday>

export function listHolidays(db: AppDatabase): Holiday[] {
  return db.select().from(holidays).all()
}

export function createHoliday(db: AppDatabase, input: NewHoliday): Holiday {
  return db.insert(holidays).values(input).returning().get()
}

export function updateHoliday(db: AppDatabase, id: number, input: HolidayUpdate): Holiday {
  return db.update(holidays).set(input).where(eq(holidays.id, id)).returning().get()
}

export function deleteHoliday(db: AppDatabase, id: number): void {
  db.delete(holidays).where(eq(holidays.id, id)).run()
}
