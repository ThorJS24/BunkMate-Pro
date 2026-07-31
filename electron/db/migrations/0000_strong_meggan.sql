CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`date` text NOT NULL,
	`period` integer NOT NULL,
	`status` text NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`slot_id` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`slot_id`) REFERENCES `timetable_slots`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `holidays` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`type` text NOT NULL,
	`label` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `holidays_date_unique` ON `holidays` (`date`);--> statement-breakpoint
CREATE TABLE `leave_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`label` text,
	`dates` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `period_type_rules` (
	`type` text PRIMARY KEY NOT NULL,
	`bucket` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`min_target` real DEFAULT 75 NOT NULL,
	`theme` text DEFAULT 'system' NOT NULL,
	`current_semester` text DEFAULT '' NOT NULL,
	`backup_interval_days` integer DEFAULT 7 NOT NULL,
	`backup_dir` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subjects` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`semester` text NOT NULL,
	`credits` integer DEFAULT 0 NOT NULL,
	`faculty` text,
	`category` text,
	`archived` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `timetable_slots` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`semester` text NOT NULL,
	`day` text NOT NULL,
	`period` integer NOT NULL,
	`subject_id` integer,
	`type` text DEFAULT 'class' NOT NULL,
	`start_time` text,
	`end_time` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `yellow_forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`subject_id` integer NOT NULL,
	`period` integer,
	`status` text DEFAULT 'pending' NOT NULL,
	`reason` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE cascade
);
