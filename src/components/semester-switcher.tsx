import { useEffect } from 'react'
import { Label } from '@/components/ui/label'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useSemestersStore } from '@/store/semesters-store'
import { useSettingsStore } from '@/store/settings-store'
import { cn } from '@/lib/utils'

/**
 * The shared "which semester am I looking at" control used on Timetable,
 * Subjects, Dashboard, and Analytics. Backed by settings.currentSemester —
 * switching here is what every semester-scoped query on those pages reads.
 */
export function SemesterSwitcher({ className }: { className?: string }) {
  const semesters = useSemestersStore((s) => s.semesters)
  const loadSemesters = useSemestersStore((s) => s.load)
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const setCurrentSemester = useSettingsStore((s) => s.setCurrentSemester)

  useEffect(() => {
    loadSemesters()
  }, [loadSemesters])

  const visible = semesters.filter((s) => !s.archived).sort((a, b) => a.number - b.number)

  if (visible.length === 0) return null

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Label htmlFor="semester-switcher" className="text-sm text-muted-foreground">
        Semester
      </Label>
      <Select value={currentSemester} onValueChange={setCurrentSemester}>
        <SelectTrigger id="semester-switcher" className="w-40">
          <SelectValue placeholder="Select semester" />
        </SelectTrigger>
        <SelectContent>
          {visible.map((s) => (
            <SelectItem key={s.id} value={s.label}>
              {s.label}
              {s.isActive ? ' (active)' : ''}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
