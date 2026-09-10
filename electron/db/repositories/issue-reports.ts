import { eq, desc } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import {
  issueReports,
  issueComments,
  type IssueCategory,
  type IssueSeverity,
  type IssueStatus,
} from '../../../src/db/schema'

export type IssueReport = typeof issueReports.$inferSelect
export type NewIssueReport = Omit<typeof issueReports.$inferInsert, 'id' | 'createdAt' | 'updatedAt'>

export type IssueComment = typeof issueComments.$inferSelect
export type NewIssueComment = Omit<typeof issueComments.$inferInsert, 'id' | 'createdAt'>

export function listIssueReports(db: AppDatabase): IssueReport[] {
  return db.select().from(issueReports).orderBy(desc(issueReports.createdAt)).all()
}

export function getIssueReport(db: AppDatabase, id: number): IssueReport | undefined {
  return db.select().from(issueReports).where(eq(issueReports.id, id)).get()
}

export function createIssueReport(db: AppDatabase, input: NewIssueReport): IssueReport {
  return db.insert(issueReports).values(input).returning().get()
}

export function updateIssueReport(
  db: AppDatabase,
  id: number,
  input: Partial<{ status: IssueStatus; title: string; description: string; severity: IssueSeverity; category: IssueCategory }>,
): IssueReport {
  return db
    .update(issueReports)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(issueReports.id, id))
    .returning()
    .get()
}

export function deleteIssueReport(db: AppDatabase, id: number): void {
  db.transaction((tx) => {
    tx.delete(issueComments).where(eq(issueComments.issueId, id)).run()
    tx.delete(issueReports).where(eq(issueReports.id, id)).run()
  })
}

export function listIssueComments(db: AppDatabase, issueId: number): IssueComment[] {
  return db.select().from(issueComments).where(eq(issueComments.issueId, issueId)).orderBy(issueComments.createdAt).all()
}

export function addIssueComment(db: AppDatabase, input: NewIssueComment): IssueComment {
  const comment = db.insert(issueComments).values(input).returning().get()
  db.update(issueReports).set({ updatedAt: new Date() }).where(eq(issueReports.id, input.issueId)).run()
  return comment
}
