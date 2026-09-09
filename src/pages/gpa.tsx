import { useEffect, useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine } from 'recharts'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSemestersStore } from '@/store/semesters-store'
import {
  GRADE_SCALE,
  calculateSgpa,
  calculateCgpa,
  calculateRequiredSgpa,
  toFourPointScale,
  type GradedSubject,
  type SemesterGpa,
} from '@/lib/gpa'

const UNGRADED = '__ungraded__'

/** Same subjects, gradePoint remapped from the 10-point scale to its 4-point equivalent. */
function toFourPointSubjects(subjects: GradedSubject[]): GradedSubject[] {
  return subjects.map((s) => ({
    credits: s.credits,
    gradePoint: s.gradePoint !== null ? toFourPointScale(s.gradePoint) : null,
  }))
}

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
        sgpa4: calculateSgpa(toFourPointSubjects(subjects)),
        totalCredits: subjects.reduce((sum, s) => sum + (s.gradePoint !== null ? s.credits : 0), 0),
      })),
    [bySemester],
  )

  const cgpa = calculateCgpa(
    semesterGpas
      .filter((s): s is { label: string; sgpa: number; sgpa4: number; totalCredits: number } => s.sgpa !== null)
      .map((s) => ({ sgpa: s.sgpa, totalCredits: s.totalCredits })),
  )
  const cgpa4 = calculateCgpa(
    semesterGpas
      .filter((s): s is { label: string; sgpa: number; sgpa4: number; totalCredits: number } => s.sgpa4 !== null)
      .map((s) => ({ sgpa: s.sgpa4, totalCredits: s.totalCredits })),
  )

  // Running CGPA after each graded semester, in order — the trajectory: each
  // point is "what your CGPA was once this semester's results were in,"
  // not that semester's own SGPA (which the chart's other line already
  // shows). Ungraded semesters are skipped rather than plotted as a dip.
  const trajectory = useMemo(() => {
    const points: { label: string; sgpa: number | null; cgpa: number | null }[] = []
    const gradedSoFar: SemesterGpa[] = []
    for (const s of semesterGpas) {
      if (s.sgpa !== null) gradedSoFar.push({ sgpa: s.sgpa, totalCredits: s.totalCredits })
      points.push({ label: s.label, sgpa: s.sgpa, cgpa: gradedSoFar.length > 0 ? calculateCgpa(gradedSoFar) : null })
    }
    return points
  }, [semesterGpas])

  const gradedCreditsSoFar = semesterGpas.reduce((sum, s) => sum + (s.sgpa !== null ? s.totalCredits : 0), 0)

  const [targetCgpaInput, setTargetCgpaInput] = useState('8.5')
  const [nextCreditsInput, setNextCreditsInput] = useState('20')
  const requiredSgpa = calculateRequiredSgpa({
    targetCgpa: Number(targetCgpaInput) || 0,
    cgpaSoFar: cgpa,
    creditsSoFar: gradedCreditsSoFar,
    nextSemesterCredits: Number(nextCreditsInput) || 0,
  })

  async function handleGradeChange(subjectId: number, value: string) {
    await update(subjectId, { gradePoint: value === UNGRADED ? null : Number(value) })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Set each subject's grade once results are out. SGPA (that semester) and CGPA (overall, across semesters)
          are weighted by credits, and only count subjects you've graded so far — ungraded ones are left out rather
          than counted as zero. CHRIST's own primary scale is out of 4; the familiar out-of-10 number (shown larger
          below) is what your marksheet and transcript both use.
        </p>
        <Card className="w-40 shrink-0">
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">CGPA</p>
            <p className="text-2xl font-semibold">{cgpa !== null ? cgpa.toFixed(2) : '—'}</p>
            <p className="text-xs text-muted-foreground">{cgpa4 !== null ? `${cgpa4.toFixed(2)} / 4` : '—'}</p>
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

      {bySemester.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">CGPA trajectory</CardTitle>
              <CardDescription>Running CGPA after each graded semester, against that semester's own SGPA.</CardDescription>
            </CardHeader>
            <CardContent>
              {trajectory.every((p) => p.cgpa === null) ? (
                <p className="text-sm text-muted-foreground">Grade a semester's subjects to see a trend.</p>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={trajectory} margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--chart-grid)" vertical={false} />
                    <XAxis dataKey="label" stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 10]} stroke="var(--chart-axis)" tick={{ fontSize: 12 }} />
                    {targetCgpaInput && Number(targetCgpaInput) > 0 && (
                      <ReferenceLine y={Number(targetCgpaInput)} stroke="var(--warning)" strokeDasharray="4 4" />
                    )}
                    <Tooltip
                      formatter={(value, name) => [Number(value).toFixed(2), name === 'cgpa' ? 'CGPA' : 'SGPA']}
                      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 8 }}
                    />
                    <Line type="monotone" dataKey="cgpa" stroke="var(--chart-1)" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line
                      type="monotone"
                      dataKey="sgpa"
                      stroke="var(--chart-3)"
                      strokeWidth={1.5}
                      strokeDasharray="4 3"
                      dot={{ r: 2.5 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">What SGPA do I need?</CardTitle>
              <CardDescription>
                Given {cgpa !== null ? `your current ${cgpa.toFixed(2)} CGPA over ${gradedCreditsSoFar} credits` : 'no graded semesters yet'}, the SGPA an upcoming semester needs to reach a target CGPA overall.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-2">
                  <Label htmlFor="target-cgpa">Target CGPA</Label>
                  <Input
                    id="target-cgpa"
                    type="number"
                    min={0}
                    max={10}
                    step={0.01}
                    className="w-28"
                    value={targetCgpaInput}
                    onChange={(e) => setTargetCgpaInput(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="next-credits">Next semester's credits</Label>
                  <Input
                    id="next-credits"
                    type="number"
                    min={1}
                    className="w-28"
                    value={nextCreditsInput}
                    onChange={(e) => setNextCreditsInput(e.target.value)}
                  />
                </div>
              </div>
              <div className="rounded-md border p-3">
                {requiredSgpa.requiredSgpa === null ? (
                  <p className="text-sm text-muted-foreground">Enter next semester's credits.</p>
                ) : requiredSgpa.unreachable ? (
                  <p className="text-sm text-destructive">
                    Not reachable from this semester alone — it would need an SGPA of{' '}
                    {requiredSgpa.requiredSgpa.toFixed(2)}, above the 10-point maximum. Spreading the recovery across
                    more than one semester is the only way there.
                  </p>
                ) : requiredSgpa.requiredSgpa <= 0 ? (
                  <p className="text-sm text-success">Already there — even a 0 SGPA next semester wouldn't drop you below this target.</p>
                ) : (
                  <p className="text-sm">
                    You need at least an <span className="font-semibold">{requiredSgpa.requiredSgpa.toFixed(2)}</span> SGPA
                    next semester.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {bySemester.map(({ semester, subjects: semSubjects }) => {
        const sgpa = calculateSgpa(semSubjects)
        const sgpa4 = calculateSgpa(toFourPointSubjects(semSubjects))
        return (
          <Card key={semester.id}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">{semester.label}</CardTitle>
              <span className="text-sm text-muted-foreground">
                SGPA: {sgpa !== null ? sgpa.toFixed(2) : '—'}
                {sgpa4 !== null && <span className="text-xs"> ({sgpa4.toFixed(2)} / 4)</span>}
              </span>
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
