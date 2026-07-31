import { create } from 'zustand'
import type { LeavePlan, NewLeavePlan, LeavePlanUpdate } from '../../electron/db/repositories/leave-plans'

interface LeavePlansState {
  plans: LeavePlan[]
  loading: boolean
  load: () => Promise<void>
  create: (input: NewLeavePlan) => Promise<LeavePlan>
  update: (id: number, input: LeavePlanUpdate) => Promise<LeavePlan>
  remove: (id: number) => Promise<void>
}

export const useLeavePlansStore = create<LeavePlansState>((set, get) => ({
  plans: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const plans = await window.bunkmate.leavePlans.list()
    set({ plans, loading: false })
  },

  create: async (input) => {
    const plan = await window.bunkmate.leavePlans.create(input)
    set({ plans: [...get().plans, plan] })
    return plan
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.leavePlans.update(id, input)
    set({ plans: get().plans.map((p) => (p.id === id ? updated : p)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.leavePlans.delete(id)
    set({ plans: get().plans.filter((p) => p.id !== id) })
  },
}))
