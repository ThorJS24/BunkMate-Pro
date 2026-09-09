import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type BunkMateApi } from './ipc/contract'

const api: BunkMateApi = {
  versions: {
    node: process.versions.node,
    electron: process.versions.electron,
  },

  semesters: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.semestersList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.semestersCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.semestersUpdate, id, input),
    setArchived: (id, archived) => ipcRenderer.invoke(IPC_CHANNELS.semestersSetArchived, id, archived),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.semestersDelete, id),
    deleteCascade: (id) => ipcRenderer.invoke(IPC_CHANNELS.semestersDeleteCascade, id),
    getDependents: (label) => ipcRenderer.invoke(IPC_CHANNELS.semestersGetDependents, label),
    rolloverPreview: (fromLabel) => ipcRenderer.invoke(IPC_CHANNELS.semestersRolloverPreview, fromLabel),
    createWithRollover: (input, fromLabel) =>
      ipcRenderer.invoke(IPC_CHANNELS.semestersCreateWithRollover, input, fromLabel),
  },

  subjects: {
    list: (opts) => ipcRenderer.invoke(IPC_CHANNELS.subjectsList, opts),
    get: (id) => ipcRenderer.invoke(IPC_CHANNELS.subjectsGet, id),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.subjectsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.subjectsUpdate, id, input),
    setArchived: (id, archived) => ipcRenderer.invoke(IPC_CHANNELS.subjectsSetArchived, id, archived),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.subjectsDelete, id),
  },

  timetableSlots: {
    list: (opts) => ipcRenderer.invoke(IPC_CHANNELS.timetableSlotsList, opts),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.timetableSlotsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.timetableSlotsUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.timetableSlotsDelete, id),
  },

  attendanceRecords: {
    list: (filter) => ipcRenderer.invoke(IPC_CHANNELS.attendanceRecordsList, filter),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.attendanceRecordsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.attendanceRecordsUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.attendanceRecordsDelete, id),
  },

  holidays: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.holidaysList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.holidaysCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.holidaysUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.holidaysDelete, id),
  },

  exams: {
    list: (opts) => ipcRenderer.invoke(IPC_CHANNELS.examsList, opts),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.examsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.examsUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.examsDelete, id),
  },

  leavePlans: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.leavePlansList),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.leavePlansCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.leavePlansUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.leavePlansDelete, id),
  },

  yellowForms: {
    list: (opts) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsList, opts),
    create: (input) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsUpdate, id, input),
    setStatus: (id, status) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsSetStatus, id, status),
    delete: (id) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsDelete, id),
    getDispute: (yellowFormId) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsGetDispute, yellowFormId),
    fileDispute: (yellowFormId, note) => ipcRenderer.invoke(IPC_CHANNELS.yellowFormsFileDispute, yellowFormId, note),
    resolveDispute: (yellowFormId, outcome) =>
      ipcRenderer.invoke(IPC_CHANNELS.yellowFormsResolveDispute, yellowFormId, outcome),
  },

  settings: {
    get: () => ipcRenderer.invoke(IPC_CHANNELS.settingsGet),
    update: (input) => ipcRenderer.invoke(IPC_CHANNELS.settingsUpdate, input),
  },

  sampleData: {
    create: () => ipcRenderer.invoke(IPC_CHANNELS.sampleDataCreate),
  },

  dangerZone: {
    clearAllData: () => ipcRenderer.invoke(IPC_CHANNELS.clearAllData),
  },

  focusMode: {
    set: (active) => ipcRenderer.invoke(IPC_CHANNELS.focusModeSet, active),
  },

  miniWindow: {
    toggle: () => ipcRenderer.invoke(IPC_CHANNELS.miniWindowToggle),
  },

  crashLog: {
    record: (message) => ipcRenderer.invoke(IPC_CHANNELS.crashLogRecord, message),
    openFolder: () => ipcRenderer.invoke(IPC_CHANNELS.crashLogOpenFolder),
  },

  periodTypeRules: {
    list: () => ipcRenderer.invoke(IPC_CHANNELS.periodTypeRulesList),
    setBucket: (type, bucket) => ipcRenderer.invoke(IPC_CHANNELS.periodTypeRulesSetBucket, type, bucket),
  },

  files: {
    saveFile: (opts) => ipcRenderer.invoke(IPC_CHANNELS.filesSaveFile, opts),
    openTextFile: (opts) => ipcRenderer.invoke(IPC_CHANNELS.filesOpenTextFile, opts),
    openPdfText: () => ipcRenderer.invoke(IPC_CHANNELS.filesOpenPdfText),
    onPdfProgress: (cb) => {
      const listener = (_e: unknown, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on(IPC_CHANNELS.filesPdfProgress, listener)
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.filesPdfProgress, listener)
      }
    },
    openDigitalPdfText: () => ipcRenderer.invoke(IPC_CHANNELS.filesOpenDigitalPdfText),
    fetchTextUrl: (url) => ipcRenderer.invoke(IPC_CHANNELS.filesFetchTextUrl, url),
  },

  espro: {
    getStatus: () => ipcRenderer.invoke(IPC_CHANNELS.esproGetStatus),
    saveCredential: (input) => ipcRenderer.invoke(IPC_CHANNELS.esproSaveCredential, input),
    removeCredential: () => ipcRenderer.invoke(IPC_CHANNELS.esproRemoveCredential),
    saveSessionId: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.esproSaveSessionId, sessionId),
    compareAttendance: (semesterLabel) => ipcRenderer.invoke(IPC_CHANNELS.esproCompareAttendance, semesterLabel),
    syncAttendance: (semesterLabel) => ipcRenderer.invoke(IPC_CHANNELS.esproSyncAttendance, semesterLabel),
    getDayPeriodDetail: (semesterLabel, date) =>
      ipcRenderer.invoke(IPC_CHANNELS.esproGetDayPeriodDetail, semesterLabel, date),
    autoImport: (semesterLabel) => ipcRenderer.invoke(IPC_CHANNELS.esproAutoImport, semesterLabel),
    onAutoSynced: (callback) => {
      const listener = (_e: unknown, data: unknown) => callback(data)
      ipcRenderer.on('espro:autoSynced', listener)
      return () => ipcRenderer.removeListener('espro:autoSynced', listener)
    },
  },

  backup: {
    now: () => ipcRenderer.invoke(IPC_CHANNELS.backupNow),
    restore: () => ipcRenderer.invoke(IPC_CHANNELS.backupRestore),
    chooseDir: () => ipcRenderer.invoke(IPC_CHANNELS.backupChooseDir),
  },

  updater: {
    checkForUpdates: () => ipcRenderer.invoke(IPC_CHANNELS.updaterCheckForUpdates),
    downloadUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.updaterDownloadUpdate),
    quitAndInstall: () => ipcRenderer.invoke(IPC_CHANNELS.updaterQuitAndInstall),
    onStatusChange: (callback) => {
      const listener = (_e: unknown, payload: unknown) => callback(payload)
      ipcRenderer.on('updater:status', listener)
      return () => ipcRenderer.removeListener('updater:status', listener)
    },
  },
}

contextBridge.exposeInMainWorld('bunkmate', api)
