CREATE TABLE `semesters` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`number` integer NOT NULL,
	`label` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`is_active` integer DEFAULT false NOT NULL,
	`archived` integer DEFAULT false NOT NULL,
	`periods_per_day` integer DEFAULT 7 NOT NULL,
	`lunch_period` integer DEFAULT 4 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `semesters_label_unique` ON `semesters` (`label`);