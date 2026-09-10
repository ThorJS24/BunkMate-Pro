import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout/legacy'

export const DEFAULT_TODAY_LAYOUT: Layout = [
  { i: 'onboarding', x: 0, y: 0, w: 12, h: 4, minW: 1, minH: 1 },
  { i: 'predictor', x: 0, y: 4, w: 6, h: 7, minW: 1, minH: 1 },
  { i: 'bunk-budget', x: 6, y: 4, w: 6, h: 7, minW: 1, minH: 1 },
  { i: 'overall-summary', x: 0, y: 11, w: 12, h: 3, minW: 1, minH: 1 },
  { i: 'alerts', x: 0, y: 14, w: 12, h: 3, minW: 1, minH: 1 },
  { i: 'classes', x: 0, y: 17, w: 12, h: 14, minW: 1, minH: 1 },
]

interface TodayLayoutStore {
  layout: Layout
  setLayout: (layout: Layout) => void
  resetLayout: () => void
}

export const useTodayLayoutStore = create<TodayLayoutStore>()(
  persist(
    (set) => ({
      layout: DEFAULT_TODAY_LAYOUT,
      setLayout: (layout) => set({ layout }),
      resetLayout: () => set({ layout: DEFAULT_TODAY_LAYOUT }),
    }),
    { name: 'bunkmate-today-layout-v2' },
  ),
)

export function resolveTodayLayout(savedLayout: Layout): Layout {
  const currentTileIds = new Set(DEFAULT_TODAY_LAYOUT.map((t) => t.i))
  const defaultsById = new Map(DEFAULT_TODAY_LAYOUT.map((t) => [t.i, t]))

  const validSaved = savedLayout
    .filter((tile) => currentTileIds.has(tile.i))
    .map((tile) => {
      const def = defaultsById.get(tile.i)
      const minW = def?.minW ?? 1
      const minH = def?.minH ?? 1
      return {
        ...tile,
        minW,
        minH,
        w: Math.max(tile.w, minW),
        h: Math.max(tile.h, minH),
      }
    })

  const savedIds = new Set(validSaved.map((t) => t.i))
  const missingDefaults = DEFAULT_TODAY_LAYOUT.filter((t) => !savedIds.has(t.i))

  return [...validSaved, ...missingDefaults]
}
