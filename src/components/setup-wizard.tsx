import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useSemestersStore } from '@/store/semesters-store'
import { useSubjectsStore } from '@/store/subjects-store'
import { useTimetableStore } from '@/store/timetable-store'
import { useSettingsStore } from '@/store/settings-store'
import { useToastStore } from '@/store/toast-store'
import { friendlyError } from '@/lib/friendly-error'
import { cn } from '@/lib/utils'

// Persisted in localStorage rather than the settings DB: this is a "never
// nag me again" preference for a single install, not data worth backing up
// or carrying across a restore.
const DISMISS_KEY = 'bunkmate:setupWizardDismissed'

/**
 * The unmissable first-launch nudge. Distinct from <OnboardingChecklist />
 * (which lives quietly on the Dashboard and in Help): this pops up as a
 * modal so a brand-new, non-technical user can't land on an empty app and
 * not know where to start. Picking a step navigates and closes for just
 * this session (it can nudge again next launch if still incomplete);
 * "Maybe later" dismisses it for good, since Help > Getting started always
 * has the same steps for anyone who wants them back.
 */
export function SetupWizard() {
  const navigate = useNavigate()
  const settingsLoaded = useSettingsStore((s) => s.loaded)
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)
  const subjects = useSubjectsStore((s) => s.subjects)
  const loadSubjects = useSubjectsStore((s) => s.load)
  const slots = useTimetableStore((s) => s.slots)
  const loadSlots = useTimetableStore((s) => s.load)

  const [dismissedForever] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const [open, setOpen] = useState(true)
  const [seeding, setSeeding] = useState(false)
  const pushToast = useToastStore((s) => s.push)

  useEffect(() => {
    loadSemesters()
    loadSubjects({ includeArchived: false })
  }, [loadSemesters, loadSubjects])
  useEffect(() => {
    if (currentSemester) loadSlots(currentSemester)
  }, [loadSlots, currentSemester])

  const semesterSubjects = subjects.filter((s) => s.semester === currentSemester)
  const steps = useMemo(
    () => [
      {
        done: semesters.length > 0,
        label: 'Create a semester',
        description: "Give BunkMate a semester to track — its name, how many periods a day, and where lunch sits.",
        to: '/semesters',
      },
      {
        done: semesterSubjects.length > 0,
        label: 'Add your subjects',
        description: 'The courses you attend, so attendance has somewhere to go.',
        to: '/subjects',
      },
      {
        done: slots.some((s) => s.type !== 'lunch'),
        label: 'Build your timetable',
        description: 'Drop each subject into its weekly slot.',
        to: '/timetable',
      },
    ],
    [semesters, semesterSubjects, slots],
  )
  const allDone = steps.every((s) => s.done)
  const nextIndex = steps.findIndex((s) => !s.done)

  async function handleTrySampleData() {
    setSeeding(true)
    try {
      await window.bunkmate.sampleData.create()
      // Subjects/timetable/attendance/settings all changed at once — a full
      // reload is simpler and safer than teaching five different stores how
      // to merge in a freshly seeded semester, and matches how a backup
      // restore already handles "everything just changed under us".
      window.location.reload()
    } catch (err) {
      const fe = friendlyError(err, 'Could not create sample data')
      pushToast({ title: 'Could not create sample data', description: fe.message, detail: fe.detail })
      setSeeding(false)
    }
  }

  function dismissForever() {
    try {
      localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // localStorage unavailable — nothing to persist, just close for now.
    }
    setOpen(false)
  }

  if (!settingsLoaded || dismissedForever || allDone || !open) return null
  const step = steps[nextIndex]

  return (
    <Dialog open onOpenChange={(next) => { if (!next) setOpen(false) }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Welcome to BunkMate Pro</DialogTitle>
          <DialogDescription>
            Let's get your semester set up — {steps.filter((s) => s.done).length} of {steps.length} steps done.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={s.label} className={cn('rounded-md border p-3', i === nextIndex && 'border-primary bg-accent/40')}>
              <p className="text-sm font-medium">
                {s.done ? '✓ ' : `${i + 1}. `}
                {s.label}
              </p>
              {!s.done && <p className="text-xs text-muted-foreground">{s.description}</p>}
            </div>
          ))}
        </div>
        {semesters.length === 0 && (
          <button
            type="button"
            onClick={handleTrySampleData}
            disabled={seeding}
            className="text-left text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
          >
            {seeding ? 'Setting up sample data…' : "Not ready to add your own? Try it with sample data first."}
          </button>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={dismissForever}>
            Maybe later
          </Button>
          <Button
            onClick={() => {
              navigate(step.to)
              setOpen(false)
            }}
          >
            Go to {step.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
