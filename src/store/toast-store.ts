import { create } from 'zustand'

export interface ToastAction {
  label: string
  onClick: () => void
}

export interface Toast {
  id: number
  title: string
  description?: string
  variant?: 'default' | 'destructive'
  action?: ToastAction
}

interface ToastState {
  toasts: Toast[]
  push: (toast: Omit<Toast, 'id'>, durationMs?: number) => void
  dismiss: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set, get) => ({
  toasts: [],
  push: (toast, durationMs = 5000) => {
    const id = nextId++
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }))
    setTimeout(() => get().dismiss(id), durationMs)
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}))
