import { create } from 'zustand'
import type { Semester, NewSemester, SemesterUpdate } from '../../electron/db/repositories/semesters'

interface SemestersState {
  semesters: Semester[]
  loading: boolean
  load: () => Promise<void>
  create: (input: NewSemester) => Promise<Semester>
  createWithRollover: (input: NewSemester, fromLabel: string) => Promise<Semester>
  update: (id: number, input: SemesterUpdate) => Promise<Semester>
  setArchived: (id: number, archived: boolean) => Promise<Semester>
  /** Rejects with a human-readable message if the semester still has dependents. */
  remove: (id: number) => Promise<void>
}

export const useSemestersStore = create<SemestersState>((set, get) => ({
  semesters: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const semesters = await window.bunkmate.semesters.list()
    set({ semesters, loading: false })
  },

  create: async (input) => {
    const semester = await window.bunkmate.semesters.create(input)
    set({
      semesters: [...get().semesters.map((s) => (semester.isActive ? { ...s, isActive: false } : s)), semester],
    })
    return semester
  },

  createWithRollover: async (input, fromLabel) => {
    const semester = await window.bunkmate.semesters.createWithRollover(input, fromLabel)
    set({
      semesters: [...get().semesters.map((s) => (semester.isActive ? { ...s, isActive: false } : s)), semester],
    })
    return semester
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.semesters.update(id, input)
    set({
      semesters: get().semesters.map((s) => {
        if (s.id === id) return updated
        return updated.isActive ? { ...s, isActive: false } : s
      }),
    })
    return updated
  },

  setArchived: async (id, archived) => {
    const updated = await window.bunkmate.semesters.setArchived(id, archived)
    set({ semesters: get().semesters.map((s) => (s.id === id ? updated : s)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.semesters.delete(id)
    set({ semesters: get().semesters.filter((s) => s.id !== id) })
  },
}))
