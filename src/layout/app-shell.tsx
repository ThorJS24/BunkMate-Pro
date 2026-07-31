import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  Table2,
  CalendarDays,
  BarChart3,
  Wand2,
  Settings,
  GraduationCap,
  NotebookPen,
  Sun,
  Award,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { GlobalSearch } from '@/components/global-search'
import { CommandPalette } from '@/components/command-palette'
import { NotificationCenter } from '@/components/notification-center'
import { ErrorBoundary } from '@/components/error-boundary'

interface NavItem {
  to: string
  label: string
  icon: typeof LayoutDashboard
  end?: boolean
}

// Grouped so the sidebar reads as "what am I doing" rather than a flat list
// of every page — day-to-day tracking, then planning/insight, then one-time
// setup, in that order.
const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: 'Overview',
    items: [
      { to: '/today', label: 'Today', icon: Sun },
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    ],
  },
  {
    label: 'Track',
    items: [
      { to: '/subjects', label: 'Subjects', icon: BookOpen },
      { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
      { to: '/timetable', label: 'Timetable', icon: Table2 },
      { to: '/calendar', label: 'Calendar', icon: CalendarDays },
      { to: '/exams', label: 'Exams', icon: NotebookPen },
    ],
  },
  {
    label: 'Plan',
    items: [
      { to: '/planner', label: 'Planner', icon: Wand2 },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/gpa', label: 'GPA', icon: Award },
    ],
  },
  {
    label: 'Setup',
    items: [
      { to: '/semesters', label: 'Semesters', icon: GraduationCap },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

export function AppShell() {
  const location = useLocation()
  return (
    <div className="flex h-full">
      <aside className="flex w-56 shrink-0 flex-col border-r bg-card">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-lg font-semibold">BunkMate Pro</span>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-2">
          {navGroups.map((group) => (
            <div key={group.label} className="space-y-1">
              <p className="px-3 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
                {group.label}
              </p>
              {group.items.map(({ to, label, icon: Icon, end }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      <CommandPalette />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b px-6">
          <GlobalSearch />
          <span className="hidden text-xs text-muted-foreground md:inline">
            Press <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">Ctrl</kbd>+
            <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">K</kbd> for commands
          </span>
          <div className="flex-1" />
          <NotificationCenter />
        </header>
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
