CREATE TABLE `exams` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`subject_id` integer,
	`date` text NOT NULL,
	`semester` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `subjects`(`id`) ON UPDATE no action ON DELETE set null
);
