import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { useSemestersStore } from '@/store/semesters-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useSettingsStore } from '@/store/settings-store'
import { cn } from '@/lib/utils'

/**
 * First-run guidance: the ordered steps to get a usable setup. Renders
 * nothing once all steps are done, so it self-dismisses without a persisted
 * "dismissed" flag — the completion state IS the dismissal.
 */
export function OnboardingChecklist() {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)
  const subjects = useSubjectsStore((s) => s.subjects)
  const loadSubjects = useSubjectsStore((s) => s.load)
  const slots = useTimetableStore((s) => s.slots)
  const loadSlots = useTimetableStore((s) => s.load)

  useEffect(() => {
    loadSemesters()
    loadSubjects({ includeArchived: false })
  }, [loadSemesters, loadSubjects])

  useEffect(() => {
    if (currentSemester) loadSlots(currentSemester)
  }, [loadSlots, currentSemester])

  const activeSemester = semesters.find((s) => s.label === currentSemester)
  const steps = useMemo(() => {
    const hasSemester = semesters.length > 0
    const semesterSubjects = subjects.filter((s) => s.semester === currentSemester)
    const hasSubjects = semesterSubjects.length > 0
    const hasTimetable = slots.some((s) => s.type !== 'lunch')
    const hasTimes = (activeSemester?.periodTimes?.length ?? 0) > 0
    return [
      { done: hasSemester, label: 'Create a semester', to: '/semesters' },
      { done: hasSubjects, label: 'Add your subjects', to: '/subjects' },
      { done: hasTimetable, label: 'Build your timetable', to: '/timetable' },
      { done: hasTimes, label: 'Allocate class times (unlocks reminders & calendar export)', to: '/timetable' },
    ]
  }, [semesters, subjects, currentSemester, slots, activeSemester])

  const allDone = steps.every((s) => s.done)
  if (allDone) return null

  const nextIndex = steps.findIndex((s) => !s.done)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Get set up</CardTitle>
        <CardDescription>
          A few steps to get BunkMate working for you ({steps.filter((s) => s.done).length}/{steps.length} done).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1">
        {steps.map((step, i) => (
          <Link
            key={step.label}
            to={step.to}
            className={cn(
              'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-accent',
              step.done && 'text-muted-foreground',
            )}
          >
            {step.done ? (
              <CheckCircle2 className="size-4 shrink-0 text-success" />
            ) : (
              <Circle className={cn('size-4 shrink-0', i === nextIndex ? 'text-primary' : 'text-muted-foreground')} />
            )}
            <span className={cn('flex-1', step.done && 'line-through')}>{step.label}</span>
            {i === nextIndex && <ArrowRight className="size-3.5 text-primary" />}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
