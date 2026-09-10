import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAttendance } from '@/hooks/use-attendance'
import { useSubjectsStore } from '@/store/subjects-store'
import { useSettingsStore } from '@/store/settings-store'
import { ShieldCheck, AlertTriangle, AlertCircle, Zap } from 'lucide-react'

interface BunkBudgetCardProps {
  targetPercentage?: number // Default 85%
}

export function BunkBudgetCard({ targetPercentage = 85 }: BunkBudgetCardProps) {
  const currentSemester = useSettingsStore((s) => s.currentSemester)
  const { bySubject } = useAttendance(currentSemester || null)
  const subjects = useSubjectsStore((s) => s.subjects)

  const budgetAnalysis = useMemo(() => {
    const targetRatio = targetPercentage / 100
    let totalSafeBunks = 0
    let subjectsAtRisk = 0
    let totalDebtClasses = 0

    const activeSubjects = currentSemester ? subjects.filter((s) => s.semester === currentSemester) : subjects

    const subjectBudgets = activeSubjects.map((sub) => {
      const att = bySubject.get(sub.id)
      const total = att?.overall.total ?? 0
      const attended = att?.overall.attended ?? 0
      const percentage = att?.overall.percentage ?? null

      let safeBunks = 0
      let requiredToRecover = 0

      if (total > 0 && percentage !== null) {
        if (percentage >= targetPercentage) {
          safeBunks = Math.max(0, Math.floor(attended / targetRatio) - total)
          totalSafeBunks += safeBunks
          if (safeBunks <= 2) subjectsAtRisk++
        } else {
          requiredToRecover = Math.ceil((targetRatio * total - attended) / (1 - targetRatio))
          totalDebtClasses += requiredToRecover
          subjectsAtRisk++
        }
      }

      return {
        subject: sub,
        total,
        attended,
        percentage,
        safeBunks,
        requiredToRecover,
      }
    })

    return {
      totalSafeBunks,
      subjectsAtRisk,
      totalDebtClasses,
      subjectBudgets,
    }
  }, [bySubject, subjects, currentSemester, targetPercentage])

  if (budgetAnalysis.subjectBudgets.length === 0) return null

  return (
    <Card className="border-primary/20 bg-card/60 shadow-sm backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Zap className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base font-semibold">Smart Bunk Budget</CardTitle>
              <CardDescription className="text-xs">
                Real-time safety margins for target ({targetPercentage}%)
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1 border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-3 w-3" />
              {budgetAnalysis.totalSafeBunks} Total Bunks Left
            </Badge>
            {budgetAnalysis.subjectsAtRisk > 0 && (
              <Badge variant="outline" className="gap-1 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {budgetAnalysis.subjectsAtRisk} At Risk
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {budgetAnalysis.subjectBudgets.map(({ subject, total, percentage, safeBunks, requiredToRecover }) => {
            const isDeficit = percentage !== null && percentage < targetPercentage
            const isLowMargin = !isDeficit && safeBunks <= 2 && total > 0

            return (
              <div
                key={subject.id}
                className="flex items-center justify-between rounded-md border bg-background/50 p-2.5 text-xs transition-colors hover:bg-accent/40"
              >
                <div className="flex flex-col truncate pr-2">
                  <span className="font-semibold truncate text-foreground">{subject.name}</span>
                  <span className="text-muted-foreground font-mono">
                    {subject.faculty || 'Core'} • {percentage !== null ? `${percentage.toFixed(1)}%` : 'No data'}
                  </span>
                </div>
                <div>
                  {total === 0 ? (
                    <Badge variant="secondary" className="text-[10px]">Upcoming</Badge>
                  ) : isDeficit ? (
                    <Badge variant="destructive" className="gap-1 text-[10px]">
                      <AlertCircle className="h-2.5 w-2.5" />
                      +{requiredToRecover} needed
                    </Badge>
                  ) : isLowMargin ? (
                    <Badge variant="outline" className="border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-[10px]">
                      {safeBunks} {safeBunks === 1 ? 'bunk' : 'bunks'} left
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px]">
                      +{safeBunks} safe {safeBunks === 1 ? 'bunk' : 'bunks'}
                    </Badge>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
