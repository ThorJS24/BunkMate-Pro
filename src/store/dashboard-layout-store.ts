import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Layout } from 'react-grid-layout/legacy'

// Where the Dashboard's tiles sit, purely a view preference — ephemeral, so
// localStorage (not the DB), same convention as notification-state-store.ts.
// Heights are generous on purpose: the goal is that typical content (a
// handful of subjects) fits without the internal scrollbar ("scrollable"
// tiles in dashboard.tsx) ever engaging.
// minW/minH are size floors, not just initial sizes — resolveDashboardLayout
// below re-applies them to every saved layout on every load (not just the
// first one), specifically so a tile can never be resized (or have been
// resized, under the old layout before these floors existed) down to a box
// that's too small to show even its own header. That was the "empty box
// still taking up space" bug — the box wasn't empty, it was just clipped to
// nothing by overflow-hidden at a height smaller than one line of text.
//
// Dashboard used to also carry ESPRO comparison, today's classes, week
// shape, upcoming exams, and upcoming holidays — all moved to their own nav
// pages (Attendance, Today, Timetable, Exams, Calendar) since piling
// everything onto one page just produced one long scroll instead of
// anything actually easier to find. Dashboard now only keeps what doesn't
// have another natural home: the overall/at-a-glance numbers.
export const DEFAULT_DASHBOARD_LAYOUT: Layout = [
  { i: 'overall', x: 0, y: 0, w: 4, h: 5, minW: 2, minH: 4 },
  { i: 'below-target', x: 4, y: 0, w: 4, h: 5, minW: 2, minH: 4 },
  { i: 'today-count', x: 8, y: 0, w: 4, h: 5, minW: 2, minH: 4 },
  { i: 'subjects', x: 0, y: 5, w: 12, h: 16, minW: 3, minH: 6 },
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
    // v3: five tiles moved off Dashboard entirely (see the comment above
    // DEFAULT_DASHBOARD_LAYOUT) — a new key so anyone with a v2 layout
    // already saved doesn't keep a stale position/size for a tile that no
    // longer exists here, and the remaining tiles get the new, wider defaults.
    { name: 'bunkmate-dashboard-layout-v3' },
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
