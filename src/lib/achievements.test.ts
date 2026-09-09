import { describe, it, expect } from 'vitest'
import { computeAchievements } from './achievements'

function base() {
  return {
    last7DaysStatuses: [] as ('present' | 'absent')[],
    overallPercentage: null as number | null,
    overallMinTarget: 85,
    subjects: [] as { percentage: number | null; target: number }[],
    bestCurrentStreak: 0,
    totalPresentThisSemester: 0,
  }
}

function findById(achievements: ReturnType<typeof computeAchievements>, id: string) {
  return achievements.find((a) => a.id === id)!
}

describe('computeAchievements', () => {
  it('earns perfect week only when every one of the last 7 days is present', () => {
    const allPresent = computeAchievements({ ...base(), last7DaysStatuses: ['present', 'present', 'present'] })
    expect(findById(allPresent, 'perfect-week').earned).toBe(true)

    const oneAbsent = computeAchievements({ ...base(), last7DaysStatuses: ['present', 'absent', 'present'] })
    expect(findById(oneAbsent, 'perfect-week').earned).toBe(false)

    const empty = computeAchievements(base())
    expect(findById(empty, 'perfect-week').earned).toBe(false)
  })

  it('earns on track only at or above the overall target', () => {
    const above = computeAchievements({ ...base(), overallPercentage: 90, overallMinTarget: 85 })
    expect(findById(above, 'on-track').earned).toBe(true)

    const below = computeAchievements({ ...base(), overallPercentage: 80, overallMinTarget: 85 })
    expect(findById(below, 'on-track').earned).toBe(false)
  })

  it('earns full house only when every subject is at or above its own target', () => {
    const allGood = computeAchievements({
      ...base(),
      subjects: [
        { percentage: 90, target: 85 },
        { percentage: 75, target: 75 },
      ],
    })
    expect(findById(allGood, 'full-house').earned).toBe(true)

    const oneShort = computeAchievements({
      ...base(),
      subjects: [
        { percentage: 90, target: 85 },
        { percentage: 70, target: 75 },
      ],
    })
    expect(findById(oneShort, 'full-house').earned).toBe(false)

    const noSubjects = computeAchievements(base())
    expect(findById(noSubjects, 'full-house').earned).toBe(false)
  })

  it('earns streak master at a 10+ streak', () => {
    expect(findById(computeAchievements({ ...base(), bestCurrentStreak: 10 }), 'streak-master').earned).toBe(true)
    expect(findById(computeAchievements({ ...base(), bestCurrentStreak: 9 }), 'streak-master').earned).toBe(false)
  })

  it('earns century at 100+ present periods', () => {
    expect(
      findById(computeAchievements({ ...base(), totalPresentThisSemester: 100 }), 'century').earned,
    ).toBe(true)
    expect(
      findById(computeAchievements({ ...base(), totalPresentThisSemester: 99 }), 'century').earned,
    ).toBe(false)
  })
})
