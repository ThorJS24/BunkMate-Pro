import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { yellowForms, yellowFormDisputes, type YellowFormDisputeOutcome } from '../../../src/db/schema'

export type YellowForm = typeof yellowForms.$inferSelect
export type NewYellowForm = Omit<typeof yellowForms.$inferInsert, 'id' | 'createdAt' | 'status' | 'disputeStatus'>
export type YellowFormUpdate = Partial<Omit<typeof yellowForms.$inferInsert, 'id' | 'createdAt' | 'disputeStatus'>>

export type YellowFormDispute = typeof yellowFormDisputes.$inferSelect

export function listYellowForms(db: AppDatabase, opts: { subjectId?: number } = {}): YellowForm[] {
  const query = db.select().from(yellowForms)
  if (opts.subjectId !== undefined) return query.where(eq(yellowForms.subjectId, opts.subjectId)).all()
  return query.all()
}

export function createYellowForm(db: AppDatabase, input: NewYellowForm): YellowForm {
  return db.insert(yellowForms).values({ ...input, status: 'pending' }).returning().get()
}

export function updateYellowForm(db: AppDatabase, id: number, input: YellowFormUpdate): YellowForm {
  return db.update(yellowForms).set(input).where(eq(yellowForms.id, id)).returning().get()
}

export function setYellowFormStatus(
  db: AppDatabase,
  id: number,
  status: YellowForm['status'],
): YellowForm {
  return db.update(yellowForms).set({ status }).where(eq(yellowForms.id, id)).returning().get()
}

export function deleteYellowForm(db: AppDatabase, id: number): void {
  db.delete(yellowForms).where(eq(yellowForms.id, id)).run()
}

export function getYellowFormDispute(db: AppDatabase, yellowFormId: number): YellowFormDispute | undefined {
  return db.select().from(yellowFormDisputes).where(eq(yellowFormDisputes.yellowFormId, yellowFormId)).get()
}

/**
 * Marks a decided (approved/rejected) form as disputed and logs the note.
 * Its own dedicated action, not routed through updateYellowForm/
 * setYellowFormStatus — disputeStatus is deliberately excluded from both of
 * those input types so it can't drift out of sync with this log.
 */
export function fileYellowFormDispute(db: AppDatabase, yellowFormId: number, note: string): YellowForm {
  const form = db.select().from(yellowForms).where(eq(yellowForms.id, yellowFormId)).get()
  if (!form) throw new Error('Yellow form not found')
  if (form.status === 'pending') throw new Error('Only an approved or rejected form can be disputed')
  if (form.disputeStatus !== 'none') throw new Error('This form already has a dispute on record')

  db.insert(yellowFormDisputes).values({ yellowFormId, note }).run()
  return db
    .update(yellowForms)
    .set({ disputeStatus: 'disputed' })
    .where(eq(yellowForms.id, yellowFormId))
    .returning()
    .get()
}

/**
 * Logs the outcome of a filed dispute (upheld = original decision stands,
 * overturned = it doesn't) and timestamps it resolved. A resolved dispute
 * isn't reopened — filing a fresh one isn't exposed by this repository.
 */
export function resolveYellowFormDispute(
  db: AppDatabase,
  yellowFormId: number,
  outcome: YellowFormDisputeOutcome,
): YellowForm {
  const dispute = getYellowFormDispute(db, yellowFormId)
  if (!dispute) throw new Error('No dispute on record for this form')
  if (dispute.outcome) throw new Error('This dispute has already been resolved')

  db.update(yellowFormDisputes)
    .set({ outcome, resolvedAt: new Date() })
    .where(eq(yellowFormDisputes.yellowFormId, yellowFormId))
    .run()
  return db
    .update(yellowForms)
    .set({ disputeStatus: 'resolved' })
    .where(eq(yellowForms.id, yellowFormId))
    .returning()
    .get()
}
