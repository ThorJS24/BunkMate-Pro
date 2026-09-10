import { create } from 'zustand'
import type { EsproProgress } from '../../electron/ipc/contract'

interface EsproSyncState {
  progress: EsproProgress | null
  isSyncing: boolean
  startSync: (initialMessage?: string) => void
  updateProgress: (p: EsproProgress) => void
  reset: () => void
}

export const useEsproSyncStore = create<EsproSyncState>((set) => ({
  progress: null,
  isSyncing: false,
  startSync: (initialMessage = 'Starting ESPRO sync...') =>
    set({
      isSyncing: true,
      progress: {
        stage: 'logging_in',
        message: initialMessage,
        percentage: 5,
      },
    }),
  updateProgress: (p) =>
    set({
      progress: p,
      isSyncing: p.stage !== 'done' && p.stage !== 'error',
    }),
  reset: () => set({ progress: null, isSyncing: false }),
}))

// Global listener initialization
if (typeof window !== 'undefined' && window.bunkmate?.espro?.onProgress) {
  window.bunkmate.espro.onProgress((p) => {
    useEsproSyncStore.getState().updateProgress(p)
  })
}
