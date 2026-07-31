import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout/legacy'

// Where the Dashboard's tiles sit, purely a view preference — ephemeral, so
// localStorage (not the DB), same convention as notification-state-store.ts.
// Heights are generous on purpose: the goal is that typical content (a
// handful of subjects/exams/holidays) fits without the internal scrollbar
// ("scrollable" tiles in dashboard.tsx) ever engaging. The ESPRO tile is
// wide (not narrow-and-tall) specifically so its comparison table never
// needs horizontal scroll either.
// minW/minH are size floors, not just initial sizes — resolveDashboardLayout
// below re-applies them to every saved layout on every load (not just the
// first one), specifically so a tile can never be resized (or have been
// resized, under the old layout before these floors existed) down to a box
// that's too small to show even its own header. That was the "empty box
// still taking up space" bug — the box wasn't empty, it was just clipped to
// nothing by overflow-hidden at a height smaller than one line of text.
export const DEFAULT_DASHBOARD_LAYOUT: Layout = [
  { i: 'overall', x: 0, y: 0, w: 3, h: 5, minW: 2, minH: 4 },
  { i: 'below-target', x: 3, y: 0, w: 2, h: 5, minW: 2, minH: 4 },
  { i: 'today-count', x: 5, y: 0, w: 2, h: 5, minW: 2, minH: 4 },
  { i: 'espro', x: 7, y: 0, w: 5, h: 9, minW: 3, minH: 5 },
  { i: 'subjects', x: 0, y: 5, w: 7, h: 14, minW: 3, minH: 6 },
  { i: 'today-classes', x: 7, y: 9, w: 5, h: 7, minW: 2, minH: 4 },
  { i: 'week-shape', x: 0, y: 19, w: 4, h: 7, minW: 2, minH: 4 },
  { i: 'upcoming-exams', x: 4, y: 19, w: 4, h: 7, minW: 2, minH: 4 },
  { i: 'upcoming-holidays', x: 8, y: 19, w: 4, h: 7, minW: 2, minH: 4 },
]

interface DashboardLayoutStore {
  layout: Layout
  setLayout: (layout: Layout) => void
  resetLayout: () => void
}

export const useDashboardLayoutStore = create<DashboardLayoutStore>()(
  persist(
    (set) => ({
      layout: DEFAULT_DASHBOARD_LAYOUT,
      setLayout: (layout) => set({ layout }),
      resetLayout: () => set({ layout: DEFAULT_DASHBOARD_LAYOUT }),
    }),
    // v2: default tile sizes changed (fixing tiles that were too small for
    // their own content, forcing an unwanted internal scrollbar) — a new key
    // so anyone with a v1 layout already saved gets the fixed defaults
    // instead of their stale small ones.
    { name: 'bunkmate-dashboard-layout-v2' },
  ),
)

const FALLBACK_MIN = { minW: 2, minH: 4 }

/**
 * Merges the persisted layout with the current set of tile ids: a tile the
 * user has already positioned keeps that position (x/y/w/h), but its
 * min-size floor always comes from the current default, not from whatever
 * was saved — so a floor added after a layout was already saved still
 * applies, and any stored size already smaller than the floor gets clamped
 * back up rather than staying stuck too small. A tile that didn't exist yet
 * falls back entirely to its default; a stored position for a tile that no
 * longer exists is dropped.
 */
export function resolveDashboardLayout(stored: Layout, visibleIds: string[]): Layout {
  const storedById = new Map(stored.map((item) => [item.i, item]))
  const defaultById = new Map(DEFAULT_DASHBOARD_LAYOUT.map((item) => [item.i, item]))
  return visibleIds.map((id) => {
    const def = defaultById.get(id) ?? { i: id, x: 0, y: 0, w: 4, h: 6, ...FALLBACK_MIN }
    const storedItem = storedById.get(id)
    if (!storedItem) return def
    const minW = def.minW ?? FALLBACK_MIN.minW
    const minH = def.minH ?? FALLBACK_MIN.minH
    return {
      ...def,
      x: storedItem.x,
      y: storedItem.y,
      w: Math.max(storedItem.w, minW),
      h: Math.max(storedItem.h, minH),
    }
  })
}
