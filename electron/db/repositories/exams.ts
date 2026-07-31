import { eq } from 'drizzle-orm'
import type { AppDatabase } from '../client'
import { exams } from '../../../src/db/schema'

export type Exam = typeof exams.$inferSelect
export type NewExam = Omit<typeof exams.$inferInsert, 'id' | 'createdAt'>
export type ExamUpdate = Partial<NewExam>

export function listExams(db: AppDatabase, opts: { semester?: string } = {}): Exam[] {
  const rows = db.select().from(exams).all()
  return opts.semester ? rows.filter((e) => e.semester === opts.semester) : rows
}

export function createExam(db: AppDatabase, input: NewExam): Exam {
  return db.insert(exams).values(input).returning().get()
}

export function updateExam(db: AppDatabase, id: number, input: ExamUpdate): Exam {
  return db.update(exams).set(input).where(eq(exams.id, id)).returning().get()
}

export function deleteExam(db: AppDatabase, id: number): void {
  db.delete(exams).where(eq(exams.id, id)).run()
}
