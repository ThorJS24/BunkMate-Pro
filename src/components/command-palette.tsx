import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sun,
  LayoutDashboard,
  BookOpen,
  CalendarCheck,
  Table2,
  CalendarDays,
  NotebookPen,
  Wand2,
  BarChart3,
  GraduationCap,
  Settings as SettingsIcon,
  MoonStar,
  ArrowRight,
  Award,
} from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { cn } from '@/lib/utils'

interface Command {
  id: string
  label: string
  hint: string
  icon: typeof Sun
  run: () => void
}

const PAGES: { to: string; label: string; icon: typeof Sun }[] = [
  { to: '/today', label: 'Today', icon: Sun },
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/subjects', label: 'Subjects', icon: BookOpen },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/timetable', label: 'Timetable', icon: Table2 },
  { to: '/calendar', label: 'Calendar', icon: CalendarDays },
  { to: '/exams', label: 'Exams', icon: NotebookPen },
  { to: '/planner', label: 'Planner', icon: Wand2 },
  { to: '/analytics', label: 'Analytics', icon: BarChart3 },
  { to: '/gpa', label: 'GPA', icon: Award },
  { to: '/semesters', label: 'Semesters', icon: GraduationCap },
  { to: '/settings', label: 'Settings', icon: SettingsIcon },
]

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const subjects = useSubjectsStore((s) => s.subjects)
  const loadSubjects = useSubjectsStore((s) => s.load)
  const theme = useSettingsStore((s) => s.theme)
  const setTheme = useSettingsStore((s) => s.setTheme)

  // Ctrl/Cmd-K opens it from anywhere (including inside other inputs).
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      loadSubjects({ includeArchived: false })
      setQuery('')
      setSelected(0)
    }
  }, [open, loadSubjects])

  const commands = useMemo<Command[]>(() => {
    const go = (to: string) => () => {
      navigate(to)
      setOpen(false)
    }
    const pageCommands: Command[] = PAGES.map((p) => ({
      id: `page-${p.to}`,
      label: p.label,
      hint: 'Go to page',
      icon: p.icon,
      run: go(p.to),
    }))
    const subjectCommands: Command[] = subjects.map((s) => ({
      id: `subject-${s.id}`,
      label: s.name,
      hint: 'Subject',
      icon: BookOpen,
      run: go('/subjects'),
    }))
    const actionCommands: Command[] = [
      {
        id: 'toggle-theme',
        label: theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme',
        hint: 'Action',
        icon: theme === 'dark' ? Sun : MoonStar,
        run: () => {
          setTheme(theme === 'dark' ? 'light' : 'dark')
          setOpen(false)
        },
      },
    ]
    return [...pageCommands, ...subjectCommands, ...actionCommands]
  }, [subjects, navigate, theme, setTheme])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return commands
    return commands.filter((c) => c.label.toLowerCase().includes(q) || c.hint.toLowerCase().includes(q))
  }, [commands, query])

  useEffect(() => {
    setSelected((s) => Math.min(s, Math.max(0, filtered.length - 1)))
  }, [filtered.length])

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected((s) => Math.min(s + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      filtered[selected]?.run()
    }
  }

  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="top-[20%] max-w-lg translate-y-0 gap-0 p-0">
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onInputKeyDown}
          placeholder="Jump to a page, subject, or action…"
          className="w-full border-b bg-transparent px-4 py-3 text-sm outline-none"
        />
        <div ref={listRef} className="max-h-80 overflow-y-auto p-1">
          {filtered.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches.</p>
          ) : (
            filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                data-selected={i === selected}
                onMouseMove={() => setSelected(i)}
                onClick={() => c.run()}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm',
                  i === selected && 'bg-accent',
                )}
              >
                <c.icon className="size-4 shrink-0 text-muted-foreground" />
                <span className="flex-1 truncate">{c.label}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{c.hint}</span>
                {i === selected && <ArrowRight className="size-3.5 text-muted-foreground" />}
              </button>
            ))
          )}
        </div>
        <div className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
          ↑↓ to navigate · Enter to select · Ctrl+K to toggle
        </div>
      </DialogContent>
    </Dialog>
  )
}
