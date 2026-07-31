import { create } from 'zustand'
import type {
  AttendanceRecord,
  NewAttendanceRecord,
  AttendanceRecordUpdate,
  AttendanceRecordFilter,
} from '../../electron/db/repositories/attendance-records'

interface AttendanceState {
  records: AttendanceRecord[]
  loading: boolean
  load: (filter?: AttendanceRecordFilter) => Promise<void>
  create: (input: NewAttendanceRecord) => Promise<AttendanceRecord>
  update: (id: number, input: AttendanceRecordUpdate) => Promise<AttendanceRecord>
  remove: (id: number) => Promise<void>
}

export const useAttendanceStore = create<AttendanceState>((set, get) => ({
  records: [],
  loading: false,

  load: async (filter) => {
    set({ loading: true })
    const records = await window.bunkmate.attendanceRecords.list(filter)
    set({ records, loading: false })
  },

  create: async (input) => {
    const record = await window.bunkmate.attendanceRecords.create(input)
    set({ records: [record, ...get().records] })
    return record
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.attendanceRecords.update(id, input)
    set({ records: get().records.map((r) => (r.id === id ? updated : r)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.attendanceRecords.delete(id)
    set({ records: get().records.filter((r) => r.id !== id) })
  },
}))
