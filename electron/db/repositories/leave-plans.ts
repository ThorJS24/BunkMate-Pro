import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { leavePlans } from '../../../src/db/schema'

export type LeavePlan = typeof leavePlans.$inferSelect
export type NewLeavePlan = Omit<typeof leavePlans.$inferInsert, 'id' | 'createdAt'>
export type LeavePlanUpdate = Partial<NewLeavePlan>

export function listLeavePlans(db: AppDatabase): LeavePlan[] {
  return db.select().from(leavePlans).all()
}

export function createLeavePlan(db: AppDatabase, input: NewLeavePlan): LeavePlan {
  return db.insert(leavePlans).values(input).returning().get()
}

export function updateLeavePlan(db: AppDatabase, id: number, input: LeavePlanUpdate): LeavePlan {
  return db.update(leavePlans).set(input).where(eq(leavePlans.id, id)).returning().get()
}

export function deleteLeavePlan(db: AppDatabase, id: number): void {
  db.delete(leavePlans).where(eq(leavePlans.id, id)).run()
}
