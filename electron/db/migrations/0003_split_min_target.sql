ALTER TABLE `settings` ADD `overall_min_target` real NOT NULL DEFAULT 75;
--> statement-breakpoint
ALTER TABLE `settings` ADD `subject_min_target` real NOT NULL DEFAULT 75;
--> statement-breakpoint
UPDATE `settings` SET `overall_min_target` = `min_target`, `subject_min_target` = `min_target`;
--> statement-breakpoint
ALTER TABLE `settings` DROP COLUMN `min_target`;
--> statement-breakpoint
ALTER TABLE `subjects` ADD `custom_min_target` real;
