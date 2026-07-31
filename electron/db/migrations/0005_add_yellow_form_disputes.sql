CREATE TABLE `yellow_form_disputes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`yellow_form_id` integer NOT NULL,
	`note` text NOT NULL,
	`outcome` text,
	`filed_at` integer NOT NULL,
	`resolved_at` integer,
	FOREIGN KEY (`yellow_form_id`) REFERENCES `yellow_forms`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `yellow_form_disputes_yellow_form_id_unique` ON `yellow_form_disputes` (`yellow_form_id`);--> statement-breakpoint
ALTER TABLE `yellow_forms` ADD `dispute_status` text DEFAULT 'none' NOT NULL;