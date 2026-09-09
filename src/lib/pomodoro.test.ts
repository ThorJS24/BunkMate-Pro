import { describe, it, expect } from 'vitest'
import { nextPhase, phaseDurationSeconds, formatSeconds, DEFAULT_POMODORO_CONFIG } from './pomodoro'

describe('phaseDurationSeconds', () => {
  it('maps each phase to its configured minutes in seconds', () => {
    expect(phaseDurationSeconds('work', DEFAULT_POMODORO_CONFIG)).toBe(25 * 60)
    expect(phaseDurationSeconds('shortBreak', DEFAULT_POMODORO_CONFIG)).toBe(5 * 60)
    expect(phaseDurationSeconds('longBreak', DEFAULT_POMODORO_CONFIG)).toBe(15 * 60)
  })
})

describe('nextPhase', () => {
  it('always goes to work after a break', () => {
    expect(nextPhase('shortBreak', 1, DEFAULT_POMODORO_CONFIG)).toBe('work')
    expect(nextPhase('longBreak', 4, DEFAULT_POMODORO_CONFIG)).toBe('work')
  })

  it('goes to a short break after a work session, except every 4th which is a long break', () => {
    expect(nextPhase('work', 1, DEFAULT_POMODORO_CONFIG)).toBe('shortBreak')
    expect(nextPhase('work', 2, DEFAULT_POMODORO_CONFIG)).toBe('shortBreak')
    expect(nextPhase('work', 3, DEFAULT_POMODORO_CONFIG)).toBe('shortBreak')
    expect(nextPhase('work', 4, DEFAULT_POMODORO_CONFIG)).toBe('longBreak')
    expect(nextPhase('work', 8, DEFAULT_POMODORO_CONFIG)).toBe('longBreak')
  })
})

describe('formatSeconds', () => {
  it('formats minutes:seconds with a zero-padded seconds part', () => {
    expect(formatSeconds(0)).toBe('0:00')
    expect(formatSeconds(65)).toBe('1:05')
    expect(formatSeconds(1500)).toBe('25:00')
  })
})
