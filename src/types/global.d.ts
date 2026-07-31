import type { BunkMateApi } from '../../electron/ipc/contract'

declare global {
  interface Window {
    bunkmate: BunkMateApi
  }
}

export {}
