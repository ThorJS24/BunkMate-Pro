import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { subjects } from '../../../src/db/schema'

export type Subject = typeof subjects.$inferSelect
export type NewSubject = Omit<typeof subjects.$inferInsert, 'id' | 'createdAt' | 'updatedAt' | 'archived'>
export type SubjectUpdate = Partial<NewSubject>

export function listSubjects(db: AppDatabase, opts: { semester?: string; includeArchived?: boolean } = {}): Subject[] {
  const rows = db.select().from(subjects).all()
  return rows.filter((s) => {
    if (opts.semester && s.semester !== opts.semester) return false
    if (!opts.includeArchived && s.archived) return false
    return true
  })
}

export function getSubject(db: AppDatabase, id: number): Subject | undefined {
  return db.select().from(subjects).where(eq(subjects.id, id)).get()
}

export function createSubject(db: AppDatabase, input: NewSubject): Subject {
  return db.insert(subjects).values(input).returning().get()
}

export function updateSubject(db: AppDatabase, id: number, input: SubjectUpdate): Subject {
  return db
    .update(subjects)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(subjects.id, id))
    .returning()
    .get()
}

export function setSubjectArchived(db: AppDatabase, id: number, archived: boolean): Subject {
  return db
    .update(subjects)
    .set({ archived, updatedAt: new Date() })
    .where(eq(subjects.id, id))
    .returning()
    .get()
}

export function deleteSubject(db: AppDatabase, id: number): void {
  db.delete(subjects).where(eq(subjects.id, id)).run()
}
