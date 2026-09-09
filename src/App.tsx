import { lazy, Suspense, useEffect } from 'react'
import { HashRouter, Route, Routes, Navigate, useLocation } from 'react-router-dom'
import { AppShell } from '@/layout/app-shell'
import { MiniPage } from '@/pages/mini'
import { useSettingsStore } from '@/store/settings-store'
import { useSemestersStore } from '@/store/semesters-store'
import { useTheme } from '@/hooks/use-theme'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { KeyboardShortcuts } from '@/components/keyboard-shortcuts'
import { SetupWizard } from '@/components/setup-wizard'
import { PomodoroWidget } from '@/components/pomodoro-widget'
import { Spinner } from '@/components/ui/spinner'

// Route-level code splitting: each page becomes its own chunk instead of all
// nine being bundled (and parsed on launch) into one ~880kB main chunk —
// only the page the user actually navigates to gets fetched/executed.
const DashboardPage = lazy(() => import('@/pages/dashboard').then((m) => ({ default: m.DashboardPage })))
const SubjectsPage = lazy(() => import('@/pages/subjects').then((m) => ({ default: m.SubjectsPage })))
const AttendancePage = lazy(() => import('@/pages/attendance').then((m) => ({ default: m.AttendancePage })))
const TimetablePage = lazy(() => import('@/pages/timetable').then((m) => ({ default: m.TimetablePage })))
const CalendarPage = lazy(() => import('@/pages/calendar').then((m) => ({ default: m.CalendarPage })))
const PlannerPage = lazy(() => import('@/pages/planner').then((m) => ({ default: m.PlannerPage })))
const AnalyticsPage = lazy(() => import('@/pages/analytics').then((m) => ({ default: m.AnalyticsPage })))
const GpaPage = lazy(() => import('@/pages/gpa').then((m) => ({ default: m.GpaPage })))
const SettingsPage = lazy(() => import('@/pages/settings').then((m) => ({ default: m.SettingsPage })))
const AccountPage = lazy(() => import('@/pages/account').then((m) => ({ default: m.AccountPage })))
const SemestersPage = lazy(() => import('@/pages/semesters').then((m) => ({ default: m.SemestersPage })))
const ExamsPage = lazy(() => import('@/pages/exams').then((m) => ({ default: m.ExamsPage })))
const TodayPage = lazy(() => import('@/pages/today').then((m) => ({ default: m.TodayPage })))

function RouteFallback() {
  return (
    <div className="flex h-full items-center justify-center py-24">
      <Spinner className="size-6 text-muted-foreground" />
    </div>
  )
}

/** The index route sends the user to their chosen launch view once settings
 * have loaded (so the choice is honored on cold start), defaulting to Today. */
function LaunchRedirect() {
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const launchView = useSettingsStore((s) => s.launchView)
  if (!settingsLoaded) return <RouteFallback />
  return <Navigate to={launchView === 'dashboard' ? '/dashboard' : '/today'} replace />
}

function App() {
  const loadSettings = useSettingsStore((s) => s.load)
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const setCurrentSemester = useSettingsStore((s) => s.setCurrentSemester)
  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)
  useEffect(() => {
    loadSettings()
    loadSemesters()
  }, [loadSettings, loadSemesters])

  // If the current-semester setting is empty or points at a semester that no
  // longer exists (deleted, or never set), fall back to whichever semester
  // is marked active so every semester-scoped page has something sensible
  // to show instead of silently rendering empty.
  useEffect(() => {
    if (!settingsLoaded || semesters.length === 0) return
    const stillValid = semesters.some((s) => s.label === currentSemester)
    if (stillValid) return
    const active = semesters.find((s) => s.isActive) ?? semesters[0]
    if (active) setCurrentSemester(active.label)
  }, [settingsLoaded, semesters, currentSemester, setCurrentSemester])

  useTheme()

  return (
    <TooltipProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </TooltipProvider>
  )
}

// The mini window (electron/mini-window.ts) loads this same bundle at
// #/mini — it needs none of the app-wide chrome/widgets below (no sidebar,
// no setup wizard, no floating Pomodoro widget over a 300x150 window), so
// this reads the route to skip them there. Has to live inside <HashRouter>
// to call useLocation().
function AppRoutes() {
  const location = useLocation()
  const isMini = location.pathname === '/mini'

  return (
    <>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="mini" element={<MiniPage />} />
          <Route element={<AppShell />}>
            <Route index element={<LaunchRedirect />} />
            <Route path="today" element={<TodayPage />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="subjects" element={<SubjectsPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="timetable" element={<TimetablePage />} />
            <Route path="calendar" element={<CalendarPage />} />
            <Route path="exams" element={<ExamsPage />} />
            <Route path="planner" element={<PlannerPage />} />
            <Route path="analytics" element={<AnalyticsPage />} />
            <Route path="gpa" element={<GpaPage />} />
            <Route path="semesters" element={<SemestersPage />} />
            <Route path="settings" element={<SettingsPage />} />
            <Route path="account" element={<AccountPage />} />
          </Route>
        </Routes>
      </Suspense>
      {!isMini && (
        <>
          <Toaster />
          <KeyboardShortcuts />
          <SetupWizard />
          <PomodoroWidget />
        </>
      )}
    </>
  )
}

export default App
