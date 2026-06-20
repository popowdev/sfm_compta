ALTER TABLE `time_entries` ADD `pause_start` datetime;--> statement-breakpoint
ALTER TABLE `time_entries` ADD `pause_minutes` int DEFAULT 0 NOT NULL;