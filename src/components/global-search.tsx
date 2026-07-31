import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, BookOpen, CalendarCheck } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useSubjectsStore } from '@/store/subjects-store'
import { useAttendanceStore } from '@/store/attendance-store'

interface SearchResult {
  id: string
  icon: typeof BookOpen
  label: string
  description: string
  onSelect: () => void
}

const MAX_RESULTS_PER_GROUP = 5

export function GlobalSearch() {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const subjects = useSubjectsStore((s) => s.subjects)
  const loadSubjects = useSubjectsStore((s) => s.load)
  const records = useAttendanceStore((s) => s.records)
  const loadRecords = useAttendanceStore((s) => s.load)
  const subjectsById = useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects])

  useEffect(() => {
    loadSubjects({ includeArchived: false })
    loadRecords()
  }, [loadSubjects, loadRecords])

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (q.length < 1) return []

    const subjectResults: SearchResult[] = subjects
      .filter((s) => s.name.toLowerCase().includes(q) || s.faculty?.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((s) => ({
        id: `subject-${s.id}`,
        icon: BookOpen,
        label: s.name,
        description: s.faculty ? `Subject · ${s.faculty}` : 'Subject',
        onSelect: () => navigate('/subjects'),
      }))

    const recordResults: SearchResult[] = records
      .filter((r) => r.date.includes(q) || r.status.includes(q))
      .slice(0, MAX_RESULTS_PER_GROUP)
      .map((r) => ({
        id: `record-${r.id}`,
        icon: CalendarCheck,
        label: `${subjectsById.get(r.subjectId)?.name ?? `#${r.subjectId}`} · ${r.date}`,
        description: `Attendance · ${r.status}`,
        onSelect: () => navigate('/attendance'),
      }))

    return [...subjectResults, ...recordResults]
  }, [query, subjects, records, subjectsById, navigate])

  return (
    <Popover open={open && results.length > 0} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setOpen(true)
            }}
            onFocus={() => setOpen(true)}
            placeholder="Search subjects, faculty, dates..."
            className="pl-8"
          />
        </div>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-1" onOpenAutoFocus={(e) => e.preventDefault()}>
        {results.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => {
              r.onSelect()
              setOpen(false)
              setQuery('')
            }}
            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
          >
            <r.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">{r.label}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{r.description}</span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  )
}
