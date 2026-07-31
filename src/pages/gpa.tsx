import { useEffect, useMemo } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSemestersStore } from '@/store/semesters-store'
import { GRADE_SCALE, calculateSgpa, calculateCgpa } from '@/lib/gpa'

const UNGRADED = '__ungraded__'

export function GpaPage() {
  const { subjects, load: loadSubjects } = useSubjectsStore()
  const { semesters, load: loadSemesters } = useSemestersStore()
  const update = useSubjectsStore((s) => s.update)

  useEffect(() => {
    loadSubjects()
    loadSemesters()
  }, [loadSubjects, loadSemesters])

  const bySemester = useMemo(() => {
    const sorted = [...semesters].sort((a, b) => a.number - b.number)
    return sorted.map((sem) => ({
      semester: sem,
      subjects: subjects.filter((s) => s.semester === sem.label),
    }))
  }, [semesters, subjects])

  const semesterGpas = useMemo(
    () =>
      bySemester.map(({ semester, subjects }) => ({
        label: semester.label,
        sgpa: calculateSgpa(subjects),
        totalCredits: subjects.reduce((sum, s) => sum + (s.gradePoint !== null ? s.credits : 0), 0),
      })),
    [bySemester],
  )

  const cgpa = calculateCgpa(
    semesterGpas
      .filter((s): s is { label: string; sgpa: number; totalCredits: number } => s.sgpa !== null)
      .map((s) => ({ sgpa: s.sgpa, totalCredits: s.totalCredits })),
  )

  async function handleGradeChange(subjectId: number, value: string) {
    await update(subjectId, { gradePoint: value === UNGRADED ? null : Number(value) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set each subject's grade once results are out. SGPA and CGPA are credit-weighted and only count graded
          subjects.
        </p>
        <Card className="w-40 shrink-0">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">CGPA</p>
            <p className="text-2xl font-semibold">{cgpa !== null ? cgpa.toFixed(2) : '—'}</p>
          </CardContent>
        </Card>
      </div>

      {bySemester.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No semesters on record yet. Add one from Semesters first.
          </CardContent>
        </Card>
      )}

      {bySemester.map(({ semester, subjects: semSubjects }) => {
        const sgpa = calculateSgpa(semSubjects)
        return (
          <Card key={semester.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{semester.label}</CardTitle>
              <span className="text-sm text-muted-foreground">SGPA: {sgpa !== null ? sgpa.toFixed(2) : '—'}</span>
            </CardHeader>
            <CardContent className="space-y-2 pt-0">
              {semSubjects.length === 0 && <p className="text-sm text-muted-foreground">No subjects yet.</p>}
              {semSubjects.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border p-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.credits} credits</p>
                  </div>
                  <Select
                    value={s.gradePoint !== null ? String(s.gradePoint) : UNGRADED}
                    onValueChange={(v) => handleGradeChange(s.id, v)}
                  >
                    <SelectTrigger className="w-36" aria-label={`Grade for ${s.name}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={UNGRADED}>Ungraded</SelectItem>
                      {GRADE_SCALE.map((g) => (
                        <SelectItem key={g.letter} value={String(g.points)}>
                          {g.letter} ({g.points})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
