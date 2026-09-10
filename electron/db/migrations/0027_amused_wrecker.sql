CREATE TABLE `issue_comments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`issue_id` integer NOT NULL,
	`author` text DEFAULT 'User' NOT NULL,
	`comment` text NOT NULL,
	`media_attachments` text DEFAULT '[]' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`issue_id`) REFERENCES `issue_reports`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `issue_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`category` text DEFAULT 'bug' NOT NULL,
	`severity` text DEFAULT 'medium' NOT NULL,
	`description` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`media_attachments` text DEFAULT '[]' NOT NULL,
	`system_diagnostics` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_semesters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`periods_per_day` integer DEFAULT 7 NOT NULL,
	`lunch_period` integer DEFAULT 5 NOT NULL,
	`period_times` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_semesters`("id", "number", "label", "start_date", "end_date", "is_active", "archived", "periods_per_day", "lunch_period", "period_times", "created_at", "updated_at") SELECT "id", "number", "label", "start_date", "end_date", "is_active", "archived", "periods_per_day", "lunch_period", "period_times", "created_at", "updated_at" FROM `semesters`;--> statement-breakpoint
DROP TABLE `semesters`;--> statement-breakpoint
ALTER TABLE `__new_semesters` RENAME TO `semesters`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `semesters_label_unique` ON `semesters` (`label`);