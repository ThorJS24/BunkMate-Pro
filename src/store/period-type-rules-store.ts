import { create } from 'zustand'
import type { PeriodTypeRule } from '../../electron/db/repositories/period-type-rules'

interface PeriodTypeRulesState {
  rules: PeriodTypeRule[]
  loading: boolean
  load: () => Promise<void>
  setBucket: (type: PeriodTypeRule['type'], bucket: PeriodTypeRule['bucket']) => Promise<PeriodTypeRule>
}

export const usePeriodTypeRulesStore = create<PeriodTypeRulesState>((set, get) => ({
  rules: [],
  loading: false,

  load: async () => {
    set({ loading: true })
    const rules = await window.bunkmate.periodTypeRules.list()
    set({ rules, loading: false })
  },

  setBucket: async (type, bucket) => {
    const updated = await window.bunkmate.periodTypeRules.setBucket(type, bucket)
    set({ rules: get().rules.map((r) => (r.type === type ? updated : r)) })
    return updated
  },
}))
