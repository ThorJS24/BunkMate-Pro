import { create } from 'zustand'
import type {
  TimetableSlot,
  NewTimetableSlot,
  TimetableSlotUpdate,
} from '../../electron/db/repositories/timetable-slots'

interface TimetableState {
  slots: TimetableSlot[]
  loading: boolean
  semester: string | null
  load: (semester: string) => Promise<void>
  create: (input: NewTimetableSlot) => Promise<TimetableSlot>
  update: (id: number, input: TimetableSlotUpdate) => Promise<TimetableSlot>
  remove: (id: number) => Promise<void>
}

export const useTimetableStore = create<TimetableState>((set, get) => ({
  slots: [],
  loading: false,
  semester: null,

  load: async (semester) => {
    set({ loading: true, semester })
    const slots = await window.bunkmate.timetableSlots.list({ semester })
    set({ slots, loading: false })
  },

  create: async (input) => {
    const slot = await window.bunkmate.timetableSlots.create(input)
    set({ slots: [...get().slots, slot] })
    return slot
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.timetableSlots.update(id, input)
    set({ slots: get().slots.map((s) => (s.id === id ? updated : s)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.timetableSlots.delete(id)
    set({ slots: get().slots.filter((s) => s.id !== id) })
  },
}))
