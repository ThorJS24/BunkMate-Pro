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
  UserCheck,
  Bug,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/global-search'
import { CommandPalette } from '@/components/command-palette'
import { NotificationCenter } from '@/components/notification-center'
import { QuickEsproSyncButton } from '@/components/quick-espro-sync'
import { HelpCenterButton } from '@/components/help-center'
import { IssueReporterDialog } from '@/components/issue-reporter-dialog'
import { ReleaseNotesDialog } from '@/components/release-notes-dialog'
import { EsproProgressBar } from '@/components/espro-progress-bar'
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
      { to: '/account', label: 'Account & ESPRO', icon: UserCheck },
      { to: '/semesters', label: 'Semesters', icon: GraduationCap },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
]

import { useEffect, useState } from 'react'
import { useAttendanceStore } from '@/store/attendance-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useToastStore } from '@/store/toast-store'
import { useNetworkStatus } from '@/hooks/use-network-status'

export function AppShell() {
  const location = useLocation()
  const [issueDialogOpen, setIssueDialogOpen] = useState(false)
  const [releaseNotesOpen, setReleaseNotesOpen] = useState(false)
  useNetworkStatus()

  useEffect(() => {
    const unsub = window.bunkmate?.espro?.onAutoSynced?.(() => {
      useSubjectsStore.getState().load({ includeArchived: false })
      useAttendanceStore.getState().load()
      useToastStore.getState().push({
        title: 'ESPRO Auto-Synced',
        description: 'Updated latest attendance & duty leave records from portal.',
      })
    })
    return () => unsub?.()
  }, [])
  return (
    <div className="flex h-full">
      <aside className="no-print flex w-56 shrink-0 flex-col border-r bg-card">
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

        {/* Bottom Left Release Notes Tab */}
        <div className="border-t p-2">
          <button
            type="button"
            onClick={() => setReleaseNotesOpen(true)}
            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
          >
            <span className="flex items-center gap-2">
              <Sparkles className="size-3.5 text-amber-500" />
              <span>Release Notes</span>
            </span>
            <span className="font-mono text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded border">
              v{window.bunkmate?.versions?.app || '2.1.2'}
            </span>
          </button>
        </div>
      </aside>
      <CommandPalette />
      <IssueReporterDialog open={issueDialogOpen} onOpenChange={setIssueDialogOpen} />
      <ReleaseNotesDialog open={releaseNotesOpen} onOpenChange={setReleaseNotesOpen} />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="no-print flex h-14 shrink-0 items-center justify-between gap-3 border-b px-6">
          <GlobalSearch />
          <span className="hidden text-xs text-muted-foreground md:inline">
            Press <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">Ctrl</kbd>+
            <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">K</kbd> for commands
          </span>
          <div className="flex-1" />
          <QuickEsproSyncButton />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setIssueDialogOpen(true)}
            aria-label="Report Bug or Issue"
            title="Report a bug, issue, or feedback"
          >
            <Bug className="size-4" />
          </Button>
          <HelpCenterButton />
          <NotificationCenter />
          <NavLink
            to="/account"
            className={({ isActive }) =>
              cn(
                'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium border transition-colors',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 hover:bg-accent text-foreground',
              )
            }
            title="Account, ESPRO Credentials & Auto-Update"
          >
            <UserCheck className="size-3.5" />
            <span>Account</span>
          </NavLink>
        </header>
        {!['/account', '/attendance'].includes(location.pathname) && (
          <EsproProgressBar compact className="mx-6 mt-4 mb-0" />
        )}
        <main className="flex-1 overflow-auto p-6">
          <ErrorBoundary key={location.pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  )
}
