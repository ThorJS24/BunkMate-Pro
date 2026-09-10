import { sqliteTable, text, integer, real, uniqueIndex, index } from 'drizzle-orm/sqlite-core'

// Weekday keys used across timetable_slots and holidays scoping.
export const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const
export type Weekday = (typeof WEEKDAYS)[number]

// Period types are table-driven (see periodTypeRules) rather than hardcoded
// in the attendance engine, so new institution-specific types can be added
// by inserting a row instead of touching engine code.
export const PERIOD_TYPES = ['class', 'project', 'mentoring', 'meeting', 'minor', 'lunch'] as const
export type PeriodType = (typeof PERIOD_TYPES)[number]

export const ATTENDANCE_STATUSES = ['present', 'absent'] as const
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number]

export const ATTENDANCE_SOURCES = ['manual', 'timetable', 'espro'] as const
export type AttendanceSource = (typeof ATTENDANCE_SOURCES)[number]

export const HOLIDAY_TYPES = ['public', 'university', 'working_saturday', 'custom'] as const
export type HolidayType = (typeof HOLIDAY_TYPES)[number]

// Built-in accent-color palettes (see src/index.css's .theme-* classes).
// 'ledger' is the original default look — kept as a named pack rather than
// "no class" so switching back to it is a real, explicit choice like any
// other pack.
export const THEME_PACKS = [
  'ledger',
  'ocean',
  'forest',
  'sunset',
  'crest',
  'founders',
  'campus',
  'convocation',
] as const
export type ThemePack = (typeof THEME_PACKS)[number]

export const LEAVE_PLAN_STATUSES = ['planned', 'taken', 'cancelled'] as const
export type LeavePlanStatus = (typeof LEAVE_PLAN_STATUSES)[number]

export const YELLOW_FORM_STATUSES = ['pending', 'approved', 'rejected'] as const
export type YellowFormStatus = (typeof YELLOW_FORM_STATUSES)[number]

// Denormalized onto yellowForms itself so a list view doesn't need a join
// just to know whether a form is under dispute. Deliberately kept separate
// from YellowFormStatus rather than folded in (e.g. no 'disputed' status
// value) — a dispute is a process layered on top of a decision, not a
// replacement decision, so it gets its own log (yellowFormDisputes) and this
// small flag.
export const YELLOW_FORM_DISPUTE_STATUSES = ['none', 'disputed', 'resolved'] as const
export type YellowFormDisputeStatus = (typeof YELLOW_FORM_DISPUTE_STATUSES)[number]

export const YELLOW_FORM_DISPUTE_OUTCOMES = ['upheld', 'overturned'] as const
export type YellowFormDisputeOutcome = (typeof YELLOW_FORM_DISPUTE_OUTCOMES)[number]

// One entry per period row shown on the Timetable grid for a semester
// (teaching periods + lunch), produced by allocateEvenPeriodTimes() in
// src/lib/period-time-allocation.ts. Shape duplicated there on purpose
// rather than imported, matching how attendance-engine.ts keeps its own
// input types decoupled from the DB schema.
export interface PeriodTime {
  period: number
  startTime: string
  endTime: string
}

// A semester's `label` (e.g. "2026-1") is the key subjects/timetableSlots
// scope against — kept as a plain text match rather than a SQL foreign key
// so existing free-text semester values on those tables keep working
// unchanged; deletion is guarded in the repository layer instead (see
// deleteSemester in electron/db/repositories/semesters.ts).
export const semesters = sqliteTable('semesters', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  number: integer('number').notNull(),
  label: text('label').notNull().unique(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(false),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  // Total grid rows shown on the Timetable page for this semester (teaching
  // periods + lunch), and which period number defaults to type 'lunch' when
  // a new slot is opened there. See src/lib/timetable-rules.ts for the
  // teaching-period cap these interact with.
  periodsPerDay: integer('periods_per_day').notNull().default(7),
  lunchPeriod: integer('lunch_period').notNull().default(5),
  // Null means "not auto-allocated yet" — the Timetable grid falls back to
  // plain "Period N" labels. Set via "Auto-allocate times" in Grid Settings;
  // changing periodsPerDay, lunchPeriod, or the day start/end time afterward
  // does NOT recompute this — it goes stale until re-run on purpose (see
  // allocateEvenPeriodTimes in src/lib/period-time-allocation.ts).
  periodTimes: text('period_times', { mode: 'json' }).$type<PeriodTime[]>(),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const subjects = sqliteTable('subjects', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  semester: text('semester').notNull(),
  credits: integer('credits').notNull().default(0),
  faculty: text('faculty'),
  category: text('category'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  // Per-subject override of settings.subjectMinTarget. Null means "inherit
  // the default subject minimum" — resolved via resolveSubjectMinTarget()
  // in the attendance engine, never read as a bare column value elsewhere.
  customMinTarget: real('custom_min_target'),
  // Optional user-chosen accent (hex) used wherever a subject is drawn as a
  // color — Week overview strips, Analytics series. Null means "fall back to
  // the palette slot for this subject's position" (see resolveSubjectColor).
  color: text('color'),
  // Grade point on a 10-point scale (see GRADE_SCALE in src/lib/gpa.ts), set
  // once results are out. Null means "not graded yet" — such subjects are
  // excluded from SGPA/CGPA rather than treated as a 0, so an in-progress
  // semester's GPA reflects only what's actually been graded.
  gradePoint: real('grade_point'),
  // Free-text notes (e.g. what's covered, reminders to self) and one link
  // (syllabus, drive folder) — both optional, shown on the subject's own
  // row/detail rather than anywhere else, so they don't need their own table.
  notes: text('notes'),
  link: text('link'),
  // Faculty contact, beyond just a name: office hours as free text (hours
  // vary too much institution-to-institution to model as structured time
  // slots) and an email. Both optional.
  facultyEmail: text('faculty_email'),
  officeHours: text('office_hours'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// Governs how each period type folds into attendance totals. Table-driven so
// new rules (e.g. a new institution-specific period type) can be added via a
// row insert instead of an engine code change.
export const periodTypeRules = sqliteTable('period_type_rules', {
  type: text('type').$type<PeriodType>().primaryKey(),
  // 'excluded' = never counted, 'project' = folds into the Project Work
  // bucket, 'normal' = counts against the subject directly, 'ignored' = not
  // shown/counted at all (e.g. lunch).
  bucket: text('bucket').$type<'excluded' | 'project' | 'normal' | 'ignored'>().notNull(),
})

export const timetableSlots = sqliteTable(
  'timetable_slots',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    semester: text('semester').notNull(),
    day: text('day').$type<Weekday>().notNull(),
    period: integer('period').notNull(),
    subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'cascade' }),
    type: text('type').$type<PeriodType>().notNull().default('class'),
    startTime: text('start_time'),
    endTime: text('end_time'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // At most one slot per semester/day/period — a timetable cell is a
    // single thing, not a list.
    uniqueIndex('timetable_slots_semester_day_period_unique').on(table.semester, table.day, table.period),
  ],
)

export const attendanceRecords = sqliteTable(
  'attendance_records',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    period: integer('period').notNull(),
    status: text('status').$type<AttendanceStatus>().notNull(),
    source: text('source').$type<AttendanceSource>().notNull().default('manual'),
    slotId: integer('slot_id').references(() => timetableSlots.id, { onDelete: 'set null' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    // At most one attendance record per subject/date/period — marking the
    // same period twice should edit the existing record, not duplicate it.
    uniqueIndex('attendance_records_subject_date_period_unique').on(table.subjectId, table.date, table.period),
    // The unique index above is keyed subjectId-first, so it can't serve a
    // date-range-only filter (no subjectId) — e.g. the Attendance page
    // loading "this month, all subjects". A plain index on date alone
    // covers that scan pattern as the table grows across semesters.
    index('attendance_records_date_idx').on(table.date),
  ],
)

export const holidays = sqliteTable('holidays', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull().unique(),
  type: text('type').$type<HolidayType>().notNull(),
  label: text('label'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// Exams/tests. subjectId is optional on purpose — a common test or a paper
// spanning several subjects isn't tied to one. onDelete 'set null' keeps the
// exam (with its date/notes) if the subject is later deleted. Scoped by
// semester label like everything else here.
export const exams = sqliteTable('exams', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  subjectId: integer('subject_id').references(() => subjects.id, { onDelete: 'set null' }),
  date: text('date').notNull(),
  semester: text('semester').notNull(),
  notes: text('notes'),
  // Course/paper code as printed on the hall ticket, e.g. "MA231".
  courseCode: text('course_code'),
  // Where it's held, e.g. "BLOCK II - Floor:FIRST - Room:K224".
  location: text('location'),
  // "HH:MM" (24h). startTime is when the paper begins; reportingTime is the
  // earlier "be seated by" time. Both null when unknown — a date-only exam
  // still works everywhere, so nothing may assume these are present.
  startTime: text('start_time'),
  reportingTime: text('reporting_time'),
  // Groups exams that belong to one sitting, e.g. "End Semester" /
  // "Mid Semester". Deliberately free text rather than its own table: the
  // Exams page just nests semester > group > exams, and a personal app doesn't
  // need group CRUD. Null means ungrouped.
  examGroup: text('exam_group'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const leavePlans = sqliteTable('leave_plans', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  label: text('label'),
  // JSON-encoded array of ISO date strings.
  dates: text('dates', { mode: 'json' }).$type<string[]>().notNull(),
  status: text('status').$type<LeavePlanStatus>().notNull().default('planned'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const yellowForms = sqliteTable('yellow_forms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  date: text('date').notNull(),
  subjectId: integer('subject_id')
    .notNull()
    .references(() => subjects.id, { onDelete: 'cascade' }),
  period: integer('period'),
  status: text('status').$type<YellowFormStatus>().notNull().default('pending'),
  reason: text('reason'),
  disputeStatus: text('dispute_status').$type<YellowFormDisputeStatus>().notNull().default('none'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// One dispute per yellow form (a resolved dispute isn't reopened — filing a
// fresh one would mean deleting this row first, which the repository layer
// doesn't expose on purpose). Only an approved or rejected form is
// disputable; outcome/resolvedAt stay null until resolved.
export const yellowFormDisputes = sqliteTable('yellow_form_disputes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  yellowFormId: integer('yellow_form_id')
    .notNull()
    .unique()
    .references(() => yellowForms.id, { onDelete: 'cascade' }),
  note: text('note').notNull(),
  outcome: text('outcome').$type<YellowFormDisputeOutcome>(),
  filedAt: integer('filed_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  resolvedAt: integer('resolved_at', { mode: 'timestamp' }),
})

// Singleton row (id = 1) holding app-wide settings.
export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Aggregate attendance (across every subject combined) needed to sit the
  // End Semester Exam — CHRIST's 2026-27 handbook prescribes 85% here,
  // distinct from and higher than the per-course target below. Used for the
  // dashboard's overall attendance warning/safe-bunk count.
  overallMinTarget: real('overall_min_target').notNull().default(85),
  // Default per-subject target — CHRIST's handbook prescribes 75% per course
  // for Mid Semester Exam / CIA II eligibility. A subject's own
  // customMinTarget (if set) takes precedence over this. See
  // resolveSubjectMinTarget() in the attendance engine.
  subjectMinTarget: real('subject_min_target').notNull().default(75),
  // How many points above target still counts as "at risk" — drives the
  // amber close-to-target warning (notifications + dashboard color). 0
  // disables the band entirely.
  atRiskMarginPp: real('at_risk_margin_pp').notNull().default(5),
  theme: text('theme').notNull().default('system'),
  // 'comfortable' (default) or 'compact' — compact tightens global spacing
  // and control heights for users tracking many subjects on one screen.
  density: text('density').notNull().default('comfortable'),
  // Built-in color palette (see THEME_PACKS) — applied as a .theme-<pack>
  // class alongside .dark/.compact in use-theme.ts.
  themePack: text('theme_pack').$type<ThemePack>().notNull().default('ledger'),
  // Optional user-picked hex color overriding the pack's primary/accent/ring
  // tokens (see use-accent-color.ts). Null means "just use the pack as-is."
  accentColor: text('accent_color'),
  // Class-start reminders (Part C): a native notification this many minutes
  // before each period, fired by the main process WHILE THE APP IS RUNNING.
  // Requires the active semester to have allocated period times.
  classReminders: integer('class_reminders', { mode: 'boolean' }).notNull().default(false),
  classReminderLeadMinutes: integer('class_reminder_lead_minutes').notNull().default(10),
  // Exam heads-ups (evening before + morning of). Defaults ON, unlike class
  // reminders: exams are rare and high-stakes, so the notification is worth
  // far more than it costs in noise. Same caveat applies — only fires while
  // the app is running.
  examReminders: integer('exam_reminders', { mode: 'boolean' }).notNull().default(true),
  // Which view the app opens on: 'today' (the once-a-day check-in, default)
  // or 'dashboard'. Kept configurable so long-time users can keep the old
  // Dashboard-first behavior.
  launchView: text('launch_view').notNull().default('today'),
  currentSemester: text('current_semester').notNull().default(''),
  // JSON-encoded array of NotificationCategory values the user has muted;
  // muted categories are dropped before notifications ever reach the bell.
  // Read/dismissed state for individual alerts is NOT here — that's ephemeral
  // view state kept in localStorage (see notification-state-store.ts), since
  // notifications are derived live and regenerate.
  mutedNotificationCategories: text('muted_notification_categories', { mode: 'json' })
    .$type<string[]>()
    .notNull()
    .default([]),
  backupIntervalDays: integer('backup_interval_days').notNull().default(7),
  backupDir: text('backup_dir'),
  lastBackupAt: integer('last_backup_at', { mode: 'timestamp' }),
  // Accessibility: 'default' | 'large' | 'larger' — adjusts the root
  // font-size everything else is sized relative to (see .font-scale-* in
  // index.css), not just body text.
  fontScale: text('font_scale').notNull().default('default'),
  // Accessibility: pushes muted text/borders further from the background
  // and thickens the focus ring (see .high-contrast in index.css).
  highContrast: integer('high_contrast', { mode: 'boolean' }).notNull().default(false),
  // Opt-in: writes uncaught main-process errors to a small local log file
  // (see electron/crash-log.ts) so a non-technical user has something worth
  // sharing beyond "it just closed". Off by default — logging is a
  // deliberate choice, not a silent default.
  crashLogEnabled: integer('crash_log_enabled', { mode: 'boolean' }).notNull().default(false),
  // Toggle for auto-creating Yellow Forms when syncing duty/medical leave from ESPRO.
  esproAutoYellowForms: integer('espro_auto_yellow_forms', { mode: 'boolean' }).notNull().default(true),
  // Sunday-evening native notification summarizing the week (overall %,
  // subjects below target, exams coming up) — see src/lib/weekly-digest.ts.
  // Defaults on like exam reminders: low-frequency (once a week), so the
  // noise cost is minimal against the value of a heads-up.
  weeklyDigestEnabled: integer('weekly_digest_enabled', { mode: 'boolean' }).notNull().default(true),
  // Used only when theme === 'schedule' (a 4th option alongside system/light/
  // dark) — "HH:MM" 24h clock times; dark mode applies between start and
  // end, wrapping past midnight when start > end (the normal case, e.g.
  // 19:00 -> 07:00). See useTheme's schedule effect for the wrap math.
  themeScheduleStart: text('theme_schedule_start').notNull().default('19:00'),
  themeScheduleEnd: text('theme_schedule_end').notNull().default('07:00'),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const SETTINGS_SINGLETON_ID = 1

export interface MediaAttachment {
  name: string
  type: string
  dataUrl?: string
  path?: string
}

export const ISSUE_CATEGORIES = ['bug', 'feature', 'espro_sync', 'ui', 'other'] as const
export type IssueCategory = (typeof ISSUE_CATEGORIES)[number]

export const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]

export const ISSUE_STATUSES = ['open', 'in_progress', 'resolved', 'closed'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const issueReports = sqliteTable('issue_reports', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  title: text('title').notNull(),
  category: text('category').$type<IssueCategory>().notNull().default('bug'),
  severity: text('severity').$type<IssueSeverity>().notNull().default('medium'),
  description: text('description').notNull(),
  status: text('status').$type<IssueStatus>().notNull().default('open'),
  mediaAttachments: text('media_attachments', { mode: 'json' }).$type<MediaAttachment[]>().notNull().default([]),
  systemDiagnostics: text('system_diagnostics'),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const issueComments = sqliteTable('issue_comments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  issueId: integer('issue_id')
    .notNull()
    .references(() => issueReports.id, { onDelete: 'cascade' }),
  author: text('author').notNull().default('User'),
  comment: text('comment').notNull(),
  mediaAttachments: text('media_attachments', { mode: 'json' }).$type<MediaAttachment[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

export const schema = {
  semesters,
  subjects,
  periodTypeRules,
  timetableSlots,
  attendanceRecords,
  holidays,
  exams,
  leavePlans,
  yellowForms,
  yellowFormDisputes,
  settings,
  issueReports,
  issueComments,
}
