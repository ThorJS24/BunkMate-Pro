import { create } from 'zustand'
import type { Holiday, NewHoliday, HolidayUpdate } from '../../electron/db/repositories/holidays'

interface HolidaysState {
  holidays: Holiday[]
  loading: boolean
  load: () => Promise<void>
  create: (input: NewHoliday) => Promise<Holiday>
  update: (id: number, input: HolidayUpdate) => Promise<Holiday>
  remove: (id: number) => Promise<void>
}

export const useHolidaysStore = create<HolidaysState>((set, get) => ({
  holidays: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const holidays = await window.bunkmate.holidays.list()
    set({ holidays, loading: false })
  },

  create: async (input) => {
    const holiday = await window.bunkmate.holidays.create(input)
    set({ holidays: [...get().holidays, holiday] })
    return holiday
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.holidays.update(id, input)
    set({ holidays: get().holidays.map((h) => (h.id === id ? updated : h)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.holidays.delete(id)
    set({ holidays: get().holidays.filter((h) => h.id !== id) })
  },
}))
