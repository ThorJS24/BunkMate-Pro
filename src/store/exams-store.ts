import { create } from 'zustand'
import type { Exam, NewExam, ExamUpdate } from '../../electron/db/repositories/exams'

interface ExamsState {
  exams: Exam[]
  loading: boolean
  load: (opts?: { semester?: string }) => Promise<void>
  create: (input: NewExam) => Promise<Exam>
  update: (id: number, input: ExamUpdate) => Promise<Exam>
  remove: (id: number) => Promise<void>
}

export const useExamsStore = create<ExamsState>((set, get) => ({
  exams: [],
  loading: false,

  load: async (opts) => {
    set({ loading: true })
    const exams = await window.bunkmate.exams.list(opts)
    set({ exams, loading: false })
  },

  create: async (input) => {
    const exam = await window.bunkmate.exams.create(input)
    set({ exams: [...get().exams, exam] })
    return exam
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.exams.update(id, input)
    set({ exams: get().exams.map((e) => (e.id === id ? updated : e)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.exams.delete(id)
    set({ exams: get().exams.filter((e) => e.id !== id) })
  },
}))
