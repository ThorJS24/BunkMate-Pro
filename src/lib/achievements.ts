// Pure, derived-from-current-data achievements — no separate "unlocked"
// state persisted anywhere. Each one is recomputed live from records/streaks/
// targets already in memory, so there's nothing to get out of sync and
// nothing new to back up. Quiet by design: shown as a passive strip, never a
// popup or notification — earning one is a side effect of using the app
// normally, not something to chase.

export interface AchievementInput {
  /** Every scheduled-and-conducted period in the last 7 calendar days, most recent last. */
  last7DaysStatuses: ('present' | 'absent')[]
  overallPercentage: number | null
  overallMinTarget: number
  /** Each active subject's own current percentage (null = no data yet) and its own target. */
  subjects: { percentage: number | null; target: number }[]
  bestCurrentStreak: number
  totalPresentThisSemester: number
}

export interface Achievement {
  id: string
  label: string
  description: string
  earned: boolean
}

export function computeAchievements(input: AchievementInput): Achievement[] {
  const { last7DaysStatuses, overallPercentage, overallMinTarget, subjects, bestCurrentStreak, totalPresentThisSemester } =
    input

  const perfectWeek = last7DaysStatuses.length > 0 && last7DaysStatuses.every((s) => s === 'present')
  const onTrack = overallPercentage !== null && overallPercentage >= overallMinTarget
  const fullHouse =
    subjects.length > 0 && subjects.every((s) => s.percentage !== null && s.percentage >= s.target)
  const streakMaster = bestCurrentStreak >= 10
  const century = totalPresentThisSemester >= 100

  return [
    {
      id: 'perfect-week',
      label: 'Perfect week',
      description: 'Present in every class over the last 7 days.',
      earned: perfectWeek,
    },
    {
      id: 'on-track',
      label: 'On track',
      description: `Overall attendance at or above your ${overallMinTarget}% target.`,
      earned: onTrack,
    },
    {
      id: 'full-house',
      label: 'Full house',
      description: 'Every subject at or above its own target, all at once.',
      earned: fullHouse,
    },
    {
      id: 'streak-master',
      label: 'Streak master',
      description: 'A 10+ class present streak in some subject.',
      earned: streakMaster,
    },
    {
      id: 'century',
      label: 'Century',
      description: '100 classes attended this semester.',
      earned: century,
    },
  ]
}
