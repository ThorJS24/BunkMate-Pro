import { create } from 'zustand'
import type { Subject, NewSubject, SubjectUpdate } from '../../electron/db/repositories/subjects'

interface SubjectsState {
  subjects: Subject[]
  loading: boolean
  load: (opts?: { semester?: string; includeArchived?: boolean }) => Promise<void>
  create: (input: NewSubject) => Promise<Subject>
  update: (id: number, input: SubjectUpdate) => Promise<Subject>
  setArchived: (id: number, archived: boolean) => Promise<Subject>
  remove: (id: number) => Promise<void>
}

export const useSubjectsStore = create<SubjectsState>((set, get) => ({
  subjects: [],
  loading: false,

  load: async (opts) => {
    set({ loading: true })
    const subjects = await window.bunkmate.subjects.list(opts)
    set({ subjects, loading: false })
  },

  create: async (input) => {
    const subject = await window.bunkmate.subjects.create(input)
    set({ subjects: [...get().subjects, subject] })
    return subject
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.subjects.update(id, input)
    set({ subjects: get().subjects.map((s) => (s.id === id ? updated : s)) })
    return updated
  },

  setArchived: async (id, archived) => {
    const updated = await window.bunkmate.subjects.setArchived(id, archived)
    set({ subjects: get().subjects.map((s) => (s.id === id ? updated : s)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.subjects.delete(id)
    set({ subjects: get().subjects.filter((s) => s.id !== id) })
  },
}))
