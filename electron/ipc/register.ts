import { ipcMain, dialog, app, shell, BrowserWindow } from 'electron'
import fs from 'node:fs'
import { crashLogPath, appendCrashLog } from '../crash-log'
import { extractHallTicketText } from '../hall-ticket-ocr'
import { extractPdfText } from '../pdf-text'
import { getEsproStatus, saveEsproCredential, removeEsproCredential, saveEsproSessionId } from '../espro/credential-store'
import { esproCompareAttendance, esproSyncAttendance, esproGetDayPeriodDetail, esproAutoImportFullStudentData } from '../espro/sync'
import type { AppDatabase } from '../db/client'
import { IPC_CHANNELS } from './contract'
import { backupNow, restoreFrom, defaultBackupFileName } from '../backup'
import { toggleMiniWindow } from '../mini-window'
import {
  semestersRepo,
  subjectsRepo,
  timetableSlotsRepo,
  attendanceRecordsRepo,
  holidaysRepo,
  examsRepo,
  leavePlansRepo,
  yellowFormsRepo,
  settingsRepo,
  periodTypeRulesRepo,
  sampleDataRepo,
  clearDataRepo,
} from '../db/repositories'

// Passing the owning BrowserWindow makes these proper modal children —
// always on top of the app window and correctly focused. Without it,
// Electron's dialogs are non-modal and can end up unfocused or hidden
// behind the main window depending on the window manager, which reads to
// the user as "I picked a file and nothing happened."
function showOpenDialog(win: BrowserWindow | null, options: Electron.OpenDialogOptions) {
  return win ? dialog.showOpenDialog(win, options) : dialog.showOpenDialog(options)
}
function showSaveDialog(win: BrowserWindow | null, options: Electron.SaveDialogOptions) {
  return win ? dialog.showSaveDialog(win, options) : dialog.showSaveDialog(options)
}

export function registerIpcHandlers(
  db: AppDatabase,
  userDataDir: string,
  crashLogState: { enabled: boolean },
  getWindow: () => BrowserWindow | null,
  focusModeState: { active: boolean },
): void {
  ipcMain.handle(IPC_CHANNELS.semestersList, () => semestersRepo.listSemesters(db))
  ipcMain.handle(IPC_CHANNELS.semestersCreate, (_e, input) => semestersRepo.createSemester(db, input))
  ipcMain.handle(IPC_CHANNELS.semestersUpdate, (_e, id: number, input) =>
    semestersRepo.updateSemester(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.semestersSetArchived, (_e, id: number, archived: boolean) =>
    semestersRepo.setSemesterArchived(db, id, archived),
  )
  ipcMain.handle(IPC_CHANNELS.semestersDelete, (_e, id: number) => semestersRepo.deleteSemester(db, id))
  ipcMain.handle(IPC_CHANNELS.semestersDeleteCascade, (_e, id: number) => semestersRepo.deleteSemesterCascade(db, id))
  ipcMain.handle(IPC_CHANNELS.semestersGetDependents, (_e, label: string) =>
    semestersRepo.getSemesterDependents(db, label),
  )
  ipcMain.handle(IPC_CHANNELS.semestersRolloverPreview, (_e, fromLabel: string) =>
    semestersRepo.getRolloverPreview(db, fromLabel),
  )
  ipcMain.handle(IPC_CHANNELS.semestersCreateWithRollover, (_e, input, fromLabel: string) =>
    semestersRepo.createSemesterWithRollover(db, input, fromLabel),
  )

  ipcMain.handle(IPC_CHANNELS.subjectsList, (_e, opts) => subjectsRepo.listSubjects(db, opts))
  ipcMain.handle(IPC_CHANNELS.subjectsGet, (_e, id: number) => subjectsRepo.getSubject(db, id))
  ipcMain.handle(IPC_CHANNELS.subjectsCreate, (_e, input) => subjectsRepo.createSubject(db, input))
  ipcMain.handle(IPC_CHANNELS.subjectsUpdate, (_e, id: number, input) =>
    subjectsRepo.updateSubject(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.subjectsSetArchived, (_e, id: number, archived: boolean) =>
    subjectsRepo.setSubjectArchived(db, id, archived),
  )
  ipcMain.handle(IPC_CHANNELS.subjectsDelete, (_e, id: number) => subjectsRepo.deleteSubject(db, id))

  ipcMain.handle(IPC_CHANNELS.timetableSlotsList, (_e, opts) =>
    timetableSlotsRepo.listTimetableSlots(db, opts),
  )
  ipcMain.handle(IPC_CHANNELS.timetableSlotsCreate, (_e, input) =>
    timetableSlotsRepo.createTimetableSlot(db, input),
  )
  ipcMain.handle(IPC_CHANNELS.timetableSlotsUpdate, (_e, id: number, input) =>
    timetableSlotsRepo.updateTimetableSlot(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.timetableSlotsDelete, (_e, id: number) =>
    timetableSlotsRepo.deleteTimetableSlot(db, id),
  )

  ipcMain.handle(IPC_CHANNELS.attendanceRecordsList, (_e, filter) =>
    attendanceRecordsRepo.listAttendanceRecords(db, filter),
  )
  ipcMain.handle(IPC_CHANNELS.attendanceRecordsCreate, (_e, input) =>
    attendanceRecordsRepo.createAttendanceRecord(db, input),
  )
  ipcMain.handle(IPC_CHANNELS.attendanceRecordsUpdate, (_e, id: number, input) =>
    attendanceRecordsRepo.updateAttendanceRecord(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.attendanceRecordsDelete, (_e, id: number) =>
    attendanceRecordsRepo.deleteAttendanceRecord(db, id),
  )

  ipcMain.handle(IPC_CHANNELS.holidaysList, () => holidaysRepo.listHolidays(db))
  ipcMain.handle(IPC_CHANNELS.holidaysCreate, (_e, input) => holidaysRepo.createHoliday(db, input))
  ipcMain.handle(IPC_CHANNELS.holidaysUpdate, (_e, id: number, input) =>
    holidaysRepo.updateHoliday(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.holidaysDelete, (_e, id: number) => holidaysRepo.deleteHoliday(db, id))

  ipcMain.handle(IPC_CHANNELS.examsList, (_e, opts) => examsRepo.listExams(db, opts))
  ipcMain.handle(IPC_CHANNELS.examsCreate, (_e, input) => examsRepo.createExam(db, input))
  ipcMain.handle(IPC_CHANNELS.examsUpdate, (_e, id: number, input) => examsRepo.updateExam(db, id, input))
  ipcMain.handle(IPC_CHANNELS.examsDelete, (_e, id: number) => examsRepo.deleteExam(db, id))

  ipcMain.handle(IPC_CHANNELS.leavePlansList, () => leavePlansRepo.listLeavePlans(db))
  ipcMain.handle(IPC_CHANNELS.leavePlansCreate, (_e, input) => leavePlansRepo.createLeavePlan(db, input))
  ipcMain.handle(IPC_CHANNELS.leavePlansUpdate, (_e, id: number, input) =>
    leavePlansRepo.updateLeavePlan(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.leavePlansDelete, (_e, id: number) => leavePlansRepo.deleteLeavePlan(db, id))

  ipcMain.handle(IPC_CHANNELS.yellowFormsList, (_e, opts) => yellowFormsRepo.listYellowForms(db, opts))
  ipcMain.handle(IPC_CHANNELS.yellowFormsCreate, (_e, input) => yellowFormsRepo.createYellowForm(db, input))
  ipcMain.handle(IPC_CHANNELS.yellowFormsUpdate, (_e, id: number, input) =>
    yellowFormsRepo.updateYellowForm(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.yellowFormsSetStatus, (_e, id: number, status) =>
    yellowFormsRepo.setYellowFormStatus(db, id, status),
  )
  ipcMain.handle(IPC_CHANNELS.yellowFormsDelete, (_e, id: number) => yellowFormsRepo.deleteYellowForm(db, id))
  ipcMain.handle(IPC_CHANNELS.yellowFormsGetDispute, (_e, yellowFormId: number) =>
    yellowFormsRepo.getYellowFormDispute(db, yellowFormId),
  )
  ipcMain.handle(IPC_CHANNELS.yellowFormsFileDispute, (_e, yellowFormId: number, note: string) =>
    yellowFormsRepo.fileYellowFormDispute(db, yellowFormId, note),
  )
  ipcMain.handle(IPC_CHANNELS.yellowFormsResolveDispute, (_e, yellowFormId: number, outcome) =>
    yellowFormsRepo.resolveYellowFormDispute(db, yellowFormId, outcome),
  )

  ipcMain.handle(IPC_CHANNELS.settingsGet, () => settingsRepo.getSettings(db))
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (_e, input) => {
    const updated = settingsRepo.updateSettings(db, input)
    if (input.crashLogEnabled !== undefined) crashLogState.enabled = input.crashLogEnabled
    return updated
  })

  ipcMain.handle(IPC_CHANNELS.sampleDataCreate, () => sampleDataRepo.createSampleData(db))

  ipcMain.handle(IPC_CHANNELS.clearAllData, () => clearDataRepo.clearAllData(db))

  ipcMain.handle(IPC_CHANNELS.focusModeSet, (_e, active: boolean) => {
    focusModeState.active = active
  })

  ipcMain.handle(IPC_CHANNELS.miniWindowToggle, () => {
    toggleMiniWindow()
  })

  ipcMain.handle(IPC_CHANNELS.crashLogRecord, (_e, message: string) => {
    if (!crashLogState.enabled) return
    try {
      appendCrashLog(userDataDir, `Unhandled render error: ${message}`)
    } catch {
      // Logging must never be why reporting a crash fails too.
    }
  })
  ipcMain.handle(IPC_CHANNELS.crashLogOpenFolder, () => {
    const logPath = crashLogPath(userDataDir)
    if (fs.existsSync(logPath)) shell.showItemInFolder(logPath)
    else shell.openPath(userDataDir)
  })

  ipcMain.handle(IPC_CHANNELS.periodTypeRulesList, () => periodTypeRulesRepo.listPeriodTypeRules(db))
  ipcMain.handle(IPC_CHANNELS.periodTypeRulesSetBucket, (_e, type, bucket) =>
    periodTypeRulesRepo.setPeriodTypeRuleBucket(db, type, bucket),
  )

  ipcMain.handle(
    IPC_CHANNELS.filesSaveFile,
    async (
      _e,
      opts: { defaultName: string; content: ArrayBuffer | string; filters: { name: string; extensions: string[] }[] },
    ) => {
      const result = await showSaveDialog(getWindow(), { defaultPath: opts.defaultName, filters: opts.filters })
      if (result.canceled || !result.filePath) return null
      const data = typeof opts.content === 'string' ? opts.content : Buffer.from(opts.content)
      fs.writeFileSync(result.filePath, data)
      return result.filePath
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.filesOpenTextFile,
    async (_e, opts: { filters: { name: string; extensions: string[] }[] }) => {
      const result = await showOpenDialog(getWindow(), { properties: ['openFile'], filters: opts.filters })
      if (result.canceled || result.filePaths.length === 0) return null
      const filePath = result.filePaths[0]
      return { name: filePath.split(/[\\/]/).pop() ?? filePath, content: fs.readFileSync(filePath, 'utf8') }
    },
  )

  ipcMain.handle(IPC_CHANNELS.filesOpenPdfText, async (event) => {
    const result = await showOpenDialog(getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    // Hall tickets are print-to-PDF with a non-extractable Type3 text layer, so
    // we OCR the rendered page rather than read the (scrambled) text stream.
    // OCR takes a few seconds, so stream progress back to the caller's window.
    const text = await extractHallTicketText(new Uint8Array(fs.readFileSync(filePath)), (p) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.filesPdfProgress, p)
    })
    return { name: filePath.split(/[\\/]/).pop() ?? filePath, text }
  })

  ipcMain.handle(IPC_CHANNELS.filesOpenDigitalPdfText, async () => {
    const result = await showOpenDialog(getWindow(), {
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const text = await extractPdfText(new Uint8Array(fs.readFileSync(filePath)))
    return { name: filePath.split(/[\\/]/).pop() ?? filePath, text }
  })

  ipcMain.handle(IPC_CHANNELS.filesFetchTextUrl, async (_e, url: string) => {
    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      throw new Error('That doesn\'t look like a valid URL.')
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      throw new Error('Only http(s) links are supported.')
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    let res: Response
    try {
      res = await fetch(parsed, { signal: controller.signal })
    } catch {
      throw new Error("Couldn't reach that link. Check the URL and your internet connection.")
    } finally {
      clearTimeout(timeout)
    }
    if (!res.ok) throw new Error(`That link returned an error (HTTP ${res.status}).`)

    // A generous but real cap — a calendar feed is text and should be well
    // under this; guards against an unexpectedly huge response (wrong URL,
    // a redirect to something that isn't a calendar) tying up memory.
    const MAX_BYTES = 5 * 1024 * 1024
    const contentLength = res.headers.get('content-length')
    if (contentLength && Number(contentLength) > MAX_BYTES) {
      throw new Error('That file is larger than expected for a calendar — double-check the link.')
    }
    const text = await res.text()
    if (text.length > MAX_BYTES) throw new Error('That file is larger than expected for a calendar — double-check the link.')
    return text
  })

  ipcMain.handle(IPC_CHANNELS.backupNow, async () => {
    const result = await showSaveDialog(getWindow(), {
      defaultPath: defaultBackupFileName(),
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null
    backupNow(result.filePath)
    settingsRepo.updateSettings(db, { lastBackupAt: new Date() })
    return result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.backupRestore, async () => {
    const result = await showOpenDialog(getWindow(), {
      title: 'Choose a BunkMate backup file',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return false
    // Any throw here (bad file, locked file, disk error) propagates as a
    // rejected promise — restoreFrom validates the file BEFORE touching the
    // live database, so a bad pick leaves the current data untouched rather
    // than half-torn-down.
    restoreFrom(result.filePaths[0])
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.backupChooseDir, async () => {
    const result = await showOpenDialog(getWindow(), { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle(IPC_CHANNELS.esproGetStatus, () => getEsproStatus(app.getPath('userData')))
  ipcMain.handle(IPC_CHANNELS.esproSaveCredential, (_e, input: { username: string; password: string }) =>
    saveEsproCredential(app.getPath('userData'), input),
  )
  ipcMain.handle(IPC_CHANNELS.esproRemoveCredential, () => removeEsproCredential(app.getPath('userData')))
  ipcMain.handle(IPC_CHANNELS.esproSaveSessionId, (_e, sessionId: string) =>
    saveEsproSessionId(app.getPath('userData'), sessionId),
  )
  ipcMain.handle(IPC_CHANNELS.esproCompareAttendance, (_e, semesterLabel: string) =>
    esproCompareAttendance(db, app.getPath('userData'), semesterLabel),
  )
  ipcMain.handle(IPC_CHANNELS.esproSyncAttendance, (_e, semesterLabel: string) =>
    esproSyncAttendance(db, app.getPath('userData'), semesterLabel),
  )
  ipcMain.handle(IPC_CHANNELS.esproGetDayPeriodDetail, (_e, semesterLabel: string, date: string) =>
    esproGetDayPeriodDetail(db, app.getPath('userData'), semesterLabel, date),
  )
  ipcMain.handle(IPC_CHANNELS.esproAutoImport, (_e, semesterLabel: string) =>
    esproAutoImportFullStudentData(db, app.getPath('userData'), semesterLabel),
  )

  ipcMain.handle(IPC_CHANNELS.updaterCheckForUpdates, async () => {
    const { checkForUpdates } = await import('../auto-updater')
    return checkForUpdates()
  })
  ipcMain.handle(IPC_CHANNELS.updaterDownloadUpdate, async () => {
    const { downloadUpdate } = await import('../auto-updater')
    return downloadUpdate()
  })
  ipcMain.handle(IPC_CHANNELS.updaterQuitAndInstall, async () => {
    const { quitAndInstall } = await import('../auto-updater')
    return quitAndInstall()
  })
}
