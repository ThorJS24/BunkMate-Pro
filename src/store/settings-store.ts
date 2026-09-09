import { create } from 'zustand'
import type { ThemePack } from '@/db/schema'

interface SettingsState {
  overallMinTarget: number
  subjectMinTarget: number
  atRiskMarginPp: number
  currentSemester: string
  theme: string
  density: string
  themePack: ThemePack
  accentColor: string | null
  fontScale: string
  highContrast: boolean
  crashLogEnabled: boolean
  classReminders: boolean
  examReminders: boolean
  weeklyDigestEnabled: boolean
  themeScheduleStart: string
  themeScheduleEnd: string
  classReminderLeadMinutes: number
  launchView: string
  mutedNotificationCategories: string[]
  backupIntervalDays: number
  backupDir: string | null
  lastBackupAt: Date | null
  loaded: boolean
  load: () => Promise<void>
  setOverallMinTarget: (value: number) => Promise<void>
  setSubjectMinTarget: (value: number) => Promise<void>
  setAtRiskMarginPp: (value: number) => Promise<void>
  setCurrentSemester: (value: string) => Promise<void>
  setTheme: (value: string) => Promise<void>
  setDensity: (value: string) => Promise<void>
  setThemePack: (value: ThemePack) => Promise<void>
  setAccentColor: (value: string | null) => Promise<void>
  setFontScale: (value: string) => Promise<void>
  setHighContrast: (value: boolean) => Promise<void>
  setCrashLogEnabled: (value: boolean) => Promise<void>
  setClassReminders: (value: boolean) => Promise<void>
  setExamReminders: (value: boolean) => Promise<void>
  setWeeklyDigestEnabled: (value: boolean) => Promise<void>
  setThemeScheduleStart: (value: string) => Promise<void>
  setThemeScheduleEnd: (value: string) => Promise<void>
  setClassReminderLeadMinutes: (value: number) => Promise<void>
  setLaunchView: (value: string) => Promise<void>
  setMutedNotificationCategories: (value: string[]) => Promise<void>
  setBackupIntervalDays: (value: number) => Promise<void>
  setBackupDir: (value: string | null) => Promise<void>
}

export const useSettingsStore = create<SettingsState>((set) => ({
  overallMinTarget: 75,
  subjectMinTarget: 75,
  atRiskMarginPp: 5,
  currentSemester: '',
  theme: 'system',
  density: 'comfortable',
  themePack: 'ledger',
  accentColor: null,
  fontScale: 'default',
  highContrast: false,
  crashLogEnabled: false,
  classReminders: false,
  examReminders: true,
  weeklyDigestEnabled: true,
  themeScheduleStart: '19:00',
  themeScheduleEnd: '07:00',
  classReminderLeadMinutes: 10,
  launchView: 'today',
  mutedNotificationCategories: [],
  backupIntervalDays: 7,
  backupDir: null,
  lastBackupAt: null,
  loaded: false,

  load: async () => {
    const settings = await window.bunkmate.settings.get()
    set({
      overallMinTarget: settings.overallMinTarget,
      subjectMinTarget: settings.subjectMinTarget,
      atRiskMarginPp: settings.atRiskMarginPp,
      currentSemester: settings.currentSemester,
      theme: settings.theme,
      density: settings.density,
      themePack: settings.themePack,
      accentColor: settings.accentColor ?? null,
      fontScale: settings.fontScale,
      highContrast: settings.highContrast,
      crashLogEnabled: settings.crashLogEnabled,
      classReminders: settings.classReminders,
      examReminders: settings.examReminders,
      weeklyDigestEnabled: settings.weeklyDigestEnabled,
      themeScheduleStart: settings.themeScheduleStart,
      themeScheduleEnd: settings.themeScheduleEnd,
      classReminderLeadMinutes: settings.classReminderLeadMinutes,
      launchView: settings.launchView,
      mutedNotificationCategories: settings.mutedNotificationCategories ?? [],
      backupIntervalDays: settings.backupIntervalDays,
      backupDir: settings.backupDir ?? null,
      lastBackupAt: settings.lastBackupAt ?? null,
      loaded: true,
    })
  },

  setOverallMinTarget: async (overallMinTarget) => {
    await window.bunkmate.settings.update({ overallMinTarget })
    set({ overallMinTarget })
  },
  setSubjectMinTarget: async (subjectMinTarget) => {
    await window.bunkmate.settings.update({ subjectMinTarget })
    set({ subjectMinTarget })
  },
  setAtRiskMarginPp: async (atRiskMarginPp) => {
    await window.bunkmate.settings.update({ atRiskMarginPp })
    set({ atRiskMarginPp })
  },
  setCurrentSemester: async (currentSemester) => {
    await window.bunkmate.settings.update({ currentSemester })
    set({ currentSemester })
  },
  setTheme: async (theme) => {
    await window.bunkmate.settings.update({ theme })
    set({ theme })
  },
  setDensity: async (density) => {
    await window.bunkmate.settings.update({ density })
    set({ density })
  },
  setThemePack: async (themePack) => {
    await window.bunkmate.settings.update({ themePack })
    set({ themePack })
  },
  setAccentColor: async (accentColor) => {
    await window.bunkmate.settings.update({ accentColor })
    set({ accentColor })
  },
  setFontScale: async (fontScale) => {
    await window.bunkmate.settings.update({ fontScale })
    set({ fontScale })
  },
  setHighContrast: async (highContrast) => {
    await window.bunkmate.settings.update({ highContrast })
    set({ highContrast })
  },
  setCrashLogEnabled: async (crashLogEnabled) => {
    await window.bunkmate.settings.update({ crashLogEnabled })
    set({ crashLogEnabled })
  },
  setExamReminders: async (examReminders) => {
    await window.bunkmate.settings.update({ examReminders })
    set({ examReminders })
  },
  setWeeklyDigestEnabled: async (weeklyDigestEnabled) => {
    await window.bunkmate.settings.update({ weeklyDigestEnabled })
    set({ weeklyDigestEnabled })
  },
  setThemeScheduleStart: async (themeScheduleStart) => {
    await window.bunkmate.settings.update({ themeScheduleStart })
    set({ themeScheduleStart })
  },
  setThemeScheduleEnd: async (themeScheduleEnd) => {
    await window.bunkmate.settings.update({ themeScheduleEnd })
    set({ themeScheduleEnd })
  },

  setClassReminders: async (classReminders) => {
    await window.bunkmate.settings.update({ classReminders })
    set({ classReminders })
  },
  setClassReminderLeadMinutes: async (classReminderLeadMinutes) => {
    await window.bunkmate.settings.update({ classReminderLeadMinutes })
    set({ classReminderLeadMinutes })
  },
  setLaunchView: async (launchView) => {
    await window.bunkmate.settings.update({ launchView })
    set({ launchView })
  },
  setMutedNotificationCategories: async (mutedNotificationCategories) => {
    await window.bunkmate.settings.update({ mutedNotificationCategories })
    set({ mutedNotificationCategories })
  },
  setBackupIntervalDays: async (backupIntervalDays) => {
    await window.bunkmate.settings.update({ backupIntervalDays })
    set({ backupIntervalDays })
  },
  setBackupDir: async (backupDir) => {
    await window.bunkmate.settings.update({ backupDir })
    set({ backupDir })
  },
}))
