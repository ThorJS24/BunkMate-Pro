import { ipcMain, dialog, app } from 'electron'
import fs from 'node:fs'
import { extractHallTicketText } from '../hall-ticket-ocr'
import { extractPdfText } from '../pdf-text'
import { getEsproStatus, saveEsproCredential, removeEsproCredential, saveEsproSessionId } from '../espro/credential-store'
import { esproCompareAttendance } from '../espro/sync'
import type { AppDatabase } from '../db/client'
import { IPC_CHANNELS } from './contract'
import { backupNow, restoreFrom, defaultBackupFileName } from '../backup'
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
} from '../db/repositories'

export function registerIpcHandlers(db: AppDatabase): void {
  ipcMain.handle(IPC_CHANNELS.semestersList, () => semestersRepo.listSemesters(db))
  ipcMain.handle(IPC_CHANNELS.semestersCreate, (_e, input) => semestersRepo.createSemester(db, input))
  ipcMain.handle(IPC_CHANNELS.semestersUpdate, (_e, id: number, input) =>
    semestersRepo.updateSemester(db, id, input),
  )
  ipcMain.handle(IPC_CHANNELS.semestersSetArchived, (_e, id: number, archived: boolean) =>
    semestersRepo.setSemesterArchived(db, id, archived),
  )
  ipcMain.handle(IPC_CHANNELS.semestersDelete, (_e, id: number) => semestersRepo.deleteSemester(db, id))
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
  ipcMain.handle(IPC_CHANNELS.settingsUpdate, (_e, input) => settingsRepo.updateSettings(db, input))

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
      const result = await dialog.showSaveDialog({ defaultPath: opts.defaultName, filters: opts.filters })
      if (result.canceled || !result.filePath) return null
      const data = typeof opts.content === 'string' ? opts.content : Buffer.from(opts.content)
      fs.writeFileSync(result.filePath, data)
      return result.filePath
    },
  )

  ipcMain.handle(
    IPC_CHANNELS.filesOpenTextFile,
    async (_e, opts: { filters: { name: string; extensions: string[] }[] }) => {
      const result = await dialog.showOpenDialog({ properties: ['openFile'], filters: opts.filters })
      if (result.canceled || result.filePaths.length === 0) return null
      const filePath = result.filePaths[0]
      return { name: filePath.split(/[\\/]/).pop() ?? filePath, content: fs.readFileSync(filePath, 'utf8') }
    },
  )

  ipcMain.handle(IPC_CHANNELS.filesOpenPdfText, async (event) => {
    const result = await dialog.showOpenDialog({
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
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const filePath = result.filePaths[0]
    const text = await extractPdfText(new Uint8Array(fs.readFileSync(filePath)))
    return { name: filePath.split(/[\\/]/).pop() ?? filePath, text }
  })

  ipcMain.handle(IPC_CHANNELS.backupNow, async () => {
    const result = await dialog.showSaveDialog({
      defaultPath: defaultBackupFileName(),
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (result.canceled || !result.filePath) return null
    backupNow(result.filePath)
    settingsRepo.updateSettings(db, { lastBackupAt: new Date() })
    return result.filePath
  })

  ipcMain.handle(IPC_CHANNELS.backupRestore, async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return false
    restoreFrom(result.filePaths[0])
    app.relaunch()
    app.exit(0)
    return true
  })

  ipcMain.handle(IPC_CHANNELS.backupChooseDir, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
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
}
