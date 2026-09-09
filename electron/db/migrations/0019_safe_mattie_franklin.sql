PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`overall_min_target` real DEFAULT 85 NOT NULL,
	`subject_min_target` real DEFAULT 75 NOT NULL,
	`at_risk_margin_pp` real DEFAULT 5 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`density` text DEFAULT 'comfortable' NOT NULL,
	`theme_pack` text DEFAULT 'ledger' NOT NULL,
	`accent_color` text,
	`class_reminders` integer DEFAULT false NOT NULL,
	`class_reminder_lead_minutes` integer DEFAULT 10 NOT NULL,
	`exam_reminders` integer DEFAULT true NOT NULL,
	`launch_view` text DEFAULT 'today' NOT NULL,
	`current_semester` text DEFAULT '' NOT NULL,
	`muted_notification_categories` text DEFAULT '[]' NOT NULL,
	`backup_interval_days` integer DEFAULT 7 NOT NULL,
	`backup_dir` text,
	`last_backup_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_settings`("id", "overall_min_target", "subject_min_target", "at_risk_margin_pp", "theme", "density", "theme_pack", "accent_color", "class_reminders", "class_reminder_lead_minutes", "exam_reminders", "launch_view", "current_semester", "muted_notification_categories", "backup_interval_days", "backup_dir", "last_backup_at", "updated_at") SELECT "id", "overall_min_target", "subject_min_target", "at_risk_margin_pp", "theme", "density", "theme_pack", "accent_color", "class_reminders", "class_reminder_lead_minutes", "exam_reminders", "launch_view", "current_semester", "muted_notification_categories", "backup_interval_days", "backup_dir", "last_backup_at", "updated_at" FROM `settings`;--> statement-breakpoint
DROP TABLE `settings`;--> statement-breakpoint
ALTER TABLE `__new_settings` RENAME TO `settings`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
-- overall_min_target's default changed 75 -> 85 (CHRIST's handbook prescribes
-- 85% aggregate for End Semester Exam eligibility, distinct from the 75%
-- per-course target). A schema default only applies to new rows, so existing
-- installs' stored 75 is bumped explicitly here — but only when it's still
-- exactly the old default, so anyone who deliberately chose 75 (or any other
-- value) keeps their own setting untouched.
UPDATE `settings` SET `overall_min_target` = 85 WHERE `overall_min_target` = 75;