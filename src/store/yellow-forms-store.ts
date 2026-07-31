import { create } from 'zustand'
import type {
  YellowForm,
  NewYellowForm,
  YellowFormUpdate,
  YellowFormDispute,
} from '../../electron/db/repositories/yellow-forms'
import type { YellowFormDisputeOutcome } from '@/db/schema'

interface YellowFormsState {
  forms: YellowForm[]
  loading: boolean
  load: (opts?: { subjectId?: number }) => Promise<void>
  create: (input: NewYellowForm) => Promise<YellowForm>
  update: (id: number, input: YellowFormUpdate) => Promise<YellowForm>
  setStatus: (id: number, status: YellowForm['status']) => Promise<YellowForm>
  remove: (id: number) => Promise<void>
  getDispute: (yellowFormId: number) => Promise<YellowFormDispute | undefined>
  fileDispute: (yellowFormId: number, note: string) => Promise<YellowForm>
  resolveDispute: (yellowFormId: number, outcome: YellowFormDisputeOutcome) => Promise<YellowForm>
}

export const useYellowFormsStore = create<YellowFormsState>((set, get) => ({
  forms: [],
  loading: false,

  load: async (opts) => {
    set({ loading: true })
    const forms = await window.bunkmate.yellowForms.list(opts)
    set({ forms, loading: false })
  },

  create: async (input) => {
    const form = await window.bunkmate.yellowForms.create(input)
    set({ forms: [...get().forms, form] })
    return form
  },

  update: async (id, input) => {
    const updated = await window.bunkmate.yellowForms.update(id, input)
    set({ forms: get().forms.map((f) => (f.id === id ? updated : f)) })
    return updated
  },

  setStatus: async (id, status) => {
    const updated = await window.bunkmate.yellowForms.setStatus(id, status)
    set({ forms: get().forms.map((f) => (f.id === id ? updated : f)) })
    return updated
  },

  remove: async (id) => {
    await window.bunkmate.yellowForms.delete(id)
    set({ forms: get().forms.filter((f) => f.id !== id) })
  },

  getDispute: (yellowFormId) => window.bunkmate.yellowForms.getDispute(yellowFormId),

  fileDispute: async (yellowFormId, note) => {
    const updated = await window.bunkmate.yellowForms.fileDispute(yellowFormId, note)
    set({ forms: get().forms.map((f) => (f.id === yellowFormId ? updated : f)) })
    return updated
  },

  resolveDispute: async (yellowFormId, outcome) => {
    const updated = await window.bunkmate.yellowForms.resolveDispute(yellowFormId, outcome)
    set({ forms: get().forms.map((f) => (f.id === yellowFormId ? updated : f)) })
    return updated
  },
}))
