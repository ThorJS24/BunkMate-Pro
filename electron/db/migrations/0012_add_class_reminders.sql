ALTER TABLE `settings` ADD `class_reminders` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `settings` ADD `class_reminder_lead_minutes` integer DEFAULT 10 NOT NULL;