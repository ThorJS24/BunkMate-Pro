// Single source of truth for the IPC surface between the renderer and the
// Electron main process. Both `preload.ts` (invoke wrappers) and
// `register.ts` (ipcMain handlers) are keyed off `IPC_CHANNELS`, so adding an
// operation means adding one entry here plus one handler + one preload call.
import type {
  Semester,
  NewSemester,
  SemesterUpdate,
  SemesterDependents,
  RolloverPreview,
} from '../db/repositories/semesters'
import type { Subject, NewSubject, SubjectUpdate } from '../db/repositories/subjects'
import type { EsproStatus, EsproSaveResult } from '../espro/types'
import type { EsproComparisonResult, EsproSyncResult, EsproAutoImportResult } from '../espro/sync'
import type { DayPeriodDetail } from '../espro/attendance-days'

/** Streamed while a hall-ticket PDF is being rasterized and OCR'd. */
export interface PdfOcrProgress {
  stage: 'loading' | 'rendering' | 'recognizing' | 'done'
  /** Overall completion, 0..1. */
  progress: number
  /** Human-readable status, e.g. "Reading page 1 of 2". */
  detail: string
}

export interface EsproProgress {
  stage:
    | 'idle'
    | 'logging_in'
    | 'fetching_overview'
    | 'discovering_courses'
    | 'creating_subjects'
    | 'fetching_days'
    | 'syncing_days'
    | 'done'
    | 'error'
  message: string
  current?: number
  total?: number
  percentage: number
}
import type {
  TimetableSlot,
  NewTimetableSlot,
  TimetableSlotUpdate,
} from '../db/repositories/timetable-slots'
import type {
  AttendanceRecord,
  NewAttendanceRecord,
  AttendanceRecordUpdate,
  AttendanceRecordFilter,
} from '../db/repositories/attendance-records'
import type { Holiday, NewHoliday, HolidayUpdate } from '../db/repositories/holidays'
import type { Exam, NewExam, ExamUpdate } from '../db/repositories/exams'
import type { LeavePlan, NewLeavePlan, LeavePlanUpdate } from '../db/repositories/leave-plans'
import type {
  YellowForm,
  NewYellowForm,
  YellowFormUpdate,
  YellowFormDispute,
} from '../db/repositories/yellow-forms'
import type { YellowFormDisputeOutcome } from '../../src/db/schema'
import type { Settings, SettingsUpdate } from '../db/repositories/settings'
import type { PeriodTypeRule } from '../db/repositories/period-type-rules'

import type {
  IssueReport,
  NewIssueReport,
  IssueComment,
  NewIssueComment,
} from '../db/repositories/issue-reports'

export const IPC_CHANNELS = {
  issuesList: 'issues:list',
  issuesCreate: 'issues:create',
  issuesUpdate: 'issues:update',
  issuesDelete: 'issues:delete',
  issuesListComments: 'issues:listComments',
  issuesAddComment: 'issues:addComment',
  issuesSelectMedia: 'issues:selectMedia',

  semestersList: 'semesters:list',
  semestersCreate: 'semesters:create',
  semestersUpdate: 'semesters:update',
  semestersSetArchived: 'semesters:setArchived',
  semestersDelete: 'semesters:delete',
  semestersDeleteCascade: 'semesters:deleteCascade',
  semestersRolloverPreview: 'semesters:rolloverPreview',
  semestersCreateWithRollover: 'semesters:createWithRollover',
  semestersGetDependents: 'semesters:getDependents',

  subjectsList: 'subjects:list',
  subjectsGet: 'subjects:get',
  subjectsCreate: 'subjects:create',
  subjectsUpdate: 'subjects:update',
  subjectsSetArchived: 'subjects:setArchived',
  subjectsDelete: 'subjects:delete',

  timetableSlotsList: 'timetableSlots:list',
  timetableSlotsCreate: 'timetableSlots:create',
  timetableSlotsUpdate: 'timetableSlots:update',
  timetableSlotsDelete: 'timetableSlots:delete',

  attendanceRecordsList: 'attendanceRecords:list',
  attendanceRecordsCreate: 'attendanceRecords:create',
  attendanceRecordsUpdate: 'attendanceRecords:update',
  attendanceRecordsDelete: 'attendanceRecords:delete',

  holidaysList: 'holidays:list',
  holidaysCreate: 'holidays:create',
  holidaysUpdate: 'holidays:update',
  holidaysDelete: 'holidays:delete',

  examsList: 'exams:list',
  examsCreate: 'exams:create',
  examsUpdate: 'exams:update',
  examsDelete: 'exams:delete',

  leavePlansList: 'leavePlans:list',
  leavePlansCreate: 'leavePlans:create',
  leavePlansUpdate: 'leavePlans:update',
  leavePlansDelete: 'leavePlans:delete',

  yellowFormsList: 'yellowForms:list',
  yellowFormsCreate: 'yellowForms:create',
  yellowFormsUpdate: 'yellowForms:update',
  yellowFormsSetStatus: 'yellowForms:setStatus',
  yellowFormsDelete: 'yellowForms:delete',
  yellowFormsGetDispute: 'yellowForms:getDispute',
  yellowFormsFileDispute: 'yellowForms:fileDispute',
  yellowFormsResolveDispute: 'yellowForms:resolveDispute',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  sampleDataCreate: 'sampleData:create',

  clearAllData: 'dangerZone:clearAllData',

  focusModeSet: 'focusMode:set',

  miniWindowToggle: 'miniWindow:toggle',

  crashLogRecord: 'crashLog:record',
  crashLogOpenFolder: 'crashLog:openFolder',

  periodTypeRulesList: 'periodTypeRules:list',
  periodTypeRulesSetBucket: 'periodTypeRules:setBucket',

  filesSaveFile: 'files:saveFile',
  filesOpenTextFile: 'files:openTextFile',
  filesOpenPdfText: 'files:openPdfText',
  filesPdfProgress: 'files:pdfProgress',
  filesOpenDigitalPdfText: 'files:openDigitalPdfText',
  filesFetchTextUrl: 'files:fetchTextUrl',

  backupNow: 'backup:now',
  backupRestore: 'backup:restore',
  backupChooseDir: 'backup:chooseDir',

  dbVacuum: 'db:vacuum',
  dbStats: 'db:stats',

  esproGetStatus: 'espro:getStatus',
  esproSaveCredential: 'espro:saveCredential',
  esproRemoveCredential: 'espro:removeCredential',
  esproSaveSessionId: 'espro:saveSessionId',
  esproCompareAttendance: 'espro:compareAttendance',
  esproSyncAttendance: 'espro:syncAttendance',
  esproGetDayPeriodDetail: 'espro:getDayPeriodDetail',
  esproAutoImport: 'espro:autoImport',
  esproProgress: 'espro:progress',

  updaterCheckForUpdates: 'updater:checkForUpdates',
  updaterDownloadUpdate: 'updater:downloadUpdate',
  updaterQuitAndInstall: 'updater:quitAndInstall',
} as const

export interface BunkMateApi {
  versions: { node: string; electron: string; app: string }

  semesters: {
    list: () => Promise<Semester[]>
    create: (input: NewSemester) => Promise<Semester>
    update: (id: number, input: SemesterUpdate) => Promise<Semester>
    setArchived: (id: number, archived: boolean) => Promise<Semester>
    /** Throws (rejects) with a human-readable message if dependents exist. */
    delete: (id: number) => Promise<void>
    /** Deletes the semester AND its subjects/timetable/exams/attendance. No dependents check — irreversible. */
    deleteCascade: (id: number) => Promise<void>
    getDependents: (label: string) => Promise<SemesterDependents>
    /** What a rollover from this semester label would copy. */
    rolloverPreview: (fromLabel: string) => Promise<RolloverPreview>
    /** Create a semester, copying subjects + timetable structure from fromLabel. */
    createWithRollover: (input: NewSemester, fromLabel: string) => Promise<Semester>
  }

  subjects: {
    list: (opts?: { semester?: string; includeArchived?: boolean }) => Promise<Subject[]>
    get: (id: number) => Promise<Subject | undefined>
    create: (input: NewSubject) => Promise<Subject>
    update: (id: number, input: SubjectUpdate) => Promise<Subject>
    setArchived: (id: number, archived: boolean) => Promise<Subject>
    delete: (id: number) => Promise<void>
  }

  timetableSlots: {
    list: (opts: { semester: string }) => Promise<TimetableSlot[]>
    create: (input: NewTimetableSlot) => Promise<TimetableSlot>
    update: (id: number, input: TimetableSlotUpdate) => Promise<TimetableSlot>
    delete: (id: number) => Promise<void>
  }

  attendanceRecords: {
    list: (filter?: AttendanceRecordFilter) => Promise<AttendanceRecord[]>
    create: (input: NewAttendanceRecord) => Promise<AttendanceRecord>
    update: (id: number, input: AttendanceRecordUpdate) => Promise<AttendanceRecord>
    delete: (id: number) => Promise<void>
  }

  holidays: {
    list: () => Promise<Holiday[]>
    create: (input: NewHoliday) => Promise<Holiday>
    update: (id: number, input: HolidayUpdate) => Promise<Holiday>
    delete: (id: number) => Promise<void>
  }

  exams: {
    list: (opts?: { semester?: string }) => Promise<Exam[]>
    create: (input: NewExam) => Promise<Exam>
    update: (id: number, input: ExamUpdate) => Promise<Exam>
    delete: (id: number) => Promise<void>
  }

  leavePlans: {
    list: () => Promise<LeavePlan[]>
    create: (input: NewLeavePlan) => Promise<LeavePlan>
    update: (id: number, input: LeavePlanUpdate) => Promise<LeavePlan>
    delete: (id: number) => Promise<void>
  }

  yellowForms: {
    list: (opts?: { subjectId?: number }) => Promise<YellowForm[]>
    create: (input: NewYellowForm) => Promise<YellowForm>
    update: (id: number, input: YellowFormUpdate) => Promise<YellowForm>
    setStatus: (id: number, status: YellowForm['status']) => Promise<YellowForm>
    delete: (id: number) => Promise<void>
    /** Undefined if no dispute has been filed for this form. */
    getDispute: (yellowFormId: number) => Promise<YellowFormDispute | undefined>
    /** Throws if the form is still pending, or already has a dispute on record. */
    fileDispute: (yellowFormId: number, note: string) => Promise<YellowForm>
    /** Throws if there's no filed dispute, or it's already resolved. */
    resolveDispute: (yellowFormId: number, outcome: YellowFormDisputeOutcome) => Promise<YellowForm>
  }

  settings: {
    get: () => Promise<Settings>
    update: (input: SettingsUpdate) => Promise<Settings>
  }

  sampleData: {
    /** Seeds a believable demo semester (subjects, timetable, two weeks of attendance) and activates it. */
    create: () => Promise<Semester>
  }

  dangerZone: {
    /** Wipes all tracked academic data (semesters, subjects, timetable, attendance, exams, holidays, leave plans, yellow forms). Leaves settings and ESPRO credentials untouched. Irreversible without a backup. */
    clearAllData: () => Promise<void>
  }

  focusMode: {
    /** While active, class/exam reminders skip firing rather than queueing. */
    set: (active: boolean) => Promise<void>
  }

  miniWindow: {
    /** Opens the small always-on-top companion window, or closes it if already open. */
    toggle: () => Promise<void>
  }

  crashLog: {
    /** No-ops unless the crash-log setting is on. */
    record: (message: string) => Promise<void>
    /** Reveals the log file (or the userData folder, if none exists yet). */
    openFolder: () => Promise<void>
  }

  periodTypeRules: {
    list: () => Promise<PeriodTypeRule[]>
    setBucket: (type: PeriodTypeRule['type'], bucket: PeriodTypeRule['bucket']) => Promise<PeriodTypeRule>
  }

  files: {
    /** Opens a native save dialog; returns the chosen path, or null if cancelled. */
    saveFile: (opts: {
      defaultName: string
      content: ArrayBuffer | string
      filters: { name: string; extensions: string[] }[]
    }) => Promise<string | null>
    /** Opens a native open dialog and returns the file's text, or null if cancelled. */
    openTextFile: (opts: {
      filters: { name: string; extensions: string[] }[]
    }) => Promise<{ name: string; content: string } | null>
    /**
     * Opens a native open dialog filtered to PDFs and returns the extracted
     * text (digital/text-selectable PDFs only — no OCR). Null if cancelled;
     * throws if the file can't be read as a PDF.
     */
    openPdfText: () => Promise<{ name: string; text: string } | null>
    /**
     * Subscribes to OCR progress for the in-flight openPdfText call so the UI
     * can show a real progress bar. Returns an unsubscribe function.
     */
    onPdfProgress: (cb: (p: PdfOcrProgress) => void) => () => void
    /**
     * Opens a native open dialog filtered to PDFs and returns the extracted
     * text of a digital (text-selectable) PDF — e.g. an academic calendar.
     * No OCR, so it's fast; won't produce useful text for a scanned/
     * print-to-PDF document (use openPdfText for those). Null if cancelled.
     */
    openDigitalPdfText: () => Promise<{ name: string; text: string } | null>
    /**
     * Fetches a URL's text content from the main process (not the renderer)
     * so it isn't subject to browser CORS restrictions a calendar host may
     * not have configured — used for "import from a shared calendar link"
     * instead of a downloaded .ics file. Throws with a plain-language reason
     * on a non-2xx response, a non-calendar content type, or a body over the
     * size cap.
     */
    fetchTextUrl: (url: string) => Promise<string>
  }

  backup: {
    /** Opens a save dialog and writes a checkpointed copy of the live DB there. */
    now: () => Promise<string | null>
    /**
     * Opens an open-file dialog, replaces the live DB with the chosen file,
     * and relaunches the app. Returns false if the user cancelled the
     * dialog (the app is not relaunched in that case).
     */
    restore: () => Promise<boolean>
    /** Opens a directory picker; returns the chosen path, or null if cancelled. */
    chooseDir: () => Promise<string | null>
  }

  espro: {
    /** Whether encryption is available, a credential is stored, and for whom. */
    getStatus: () => Promise<EsproStatus>
    /**
     * Encrypts the password with safeStorage and writes it (plus a plaintext
     * username sidecar) to userData. Returns a structured failure rather than
     * throwing when encryption is unavailable or input is invalid — the
     * plaintext password is never persisted, logged, or echoed back.
     */
    saveCredential: (input: { username: string; password: string }) => Promise<EsproSaveResult>
    /** Deletes the stored encrypted credential and its sidecar entirely. */
    removeCredential: () => Promise<void>
    /**
     * Saves (or clears, with an empty string) the ESPRO session/term number
     * used to scope the attendance-totals comparison. Not a secret — see
     * credential-store.ts.
     */
    saveSessionId: (sessionId: string) => Promise<void>
    /**
     * Logs into ESPRO, fetches its official per-subject totals plus a
     * day-by-day present/absent breakdown, and compares both against
     * BunkMate's own locally-computed numbers for `semesterLabel`. Also
     * returns period-by-period detail for any mismatched date (bounded — see
     * MAX_PERIOD_DRILLDOWNS in sync.ts). A trust check, not an import — see
     * attendance-totals.ts for why ESPRO's data can't honestly be turned into
     * per-period records. Rejects if no credential/session id is stored,
     * login fails, or an endpoint doesn't respond as expected.
     */
    compareAttendance: (semesterLabel: string) => Promise<EsproComparisonResult>
    /**
     * Writes ESPRO's per-period attendance into BunkMate's own records
     * (source 'espro') for any date ESPRO has data for that BunkMate doesn't
     * already match — see sync.ts's esproSyncAttendance for the full rule.
     * Requires this semester's period times to be allocated first (see
     * EsproSyncResult.missingPeriodTimes). Rejects under the same conditions
     * as compareAttendance.
     */
    syncAttendance: (semesterLabel: string) => Promise<EsproSyncResult>
    /**
     * Period-by-period ESPRO-vs-local detail for exactly one date, fetched
     * on demand (a fresh login + one request) — the day comparison table
     * calls this whenever a user clicks ANY day, not just the pre-fetched
     * mismatches compareAttendance already bundles. Rejects under the same
     * conditions as compareAttendance.
     */
    getDayPeriodDetail: (semesterLabel: string, date: string) => Promise<DayPeriodDetail>
    /**
     * 1-Click Full ESPRO Auto-Import: Scrapes all courses, creates missing subjects,
     * auto-allocates default period times if missing, and syncs all historical logs.
     */
    autoImport: (semesterLabel: string) => Promise<EsproAutoImportResult>
    /** Listens for background auto-sync completion notifications. Returns cleanup function. */
    onAutoSynced?: (callback: (result: unknown) => void) => () => void
    /** Listens for live ESPRO sync & import progress updates. Returns cleanup function. */
    onProgress?: (callback: (progress: EsproProgress) => void) => () => void
  }

  issues?: {
    list: () => Promise<IssueReport[]>
    create: (input: NewIssueReport) => Promise<IssueReport>
    update: (id: number, input: Partial<IssueReport>) => Promise<IssueReport>
    delete: (id: number) => Promise<void>
    listComments: (issueId: number) => Promise<IssueComment[]>
    addComment: (input: NewIssueComment) => Promise<IssueComment>
    selectMedia: () => Promise<{ name: string; type: string; dataUrl: string; path: string }[]>
  }

  db?: {
    vacuum: () => Promise<{ success: boolean; freedBytes: number; beforeSize: number; afterSize: number; error?: string }>
    stats: () => Promise<{ success: boolean; dbPath: string; dbSizeMb: string; walSizeMb: string; totalSizeMb: string; pageCount: number; pageSize: number; error?: string }>
  }

  updater?: {
    checkForUpdates: () => Promise<{ status: string; info?: unknown; error?: string }>
    downloadUpdate: () => Promise<void>
    quitAndInstall: () => void
    onStatusChange?: (callback: (payload: unknown) => void) => () => void
  }
}
