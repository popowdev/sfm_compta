CREATE TABLE `company_events` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`title` varchar(150) NOT NULL,
	`poster_path` varchar(255),
	`event_date` date NOT NULL,
	`revenue` decimal(14,2) NOT NULL DEFAULT '0',
	`charges` decimal(14,2) NOT NULL DEFAULT '0',
	`profit` decimal(14,2) NOT NULL DEFAULT '0',
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_events` ADD CONSTRAINT `company_events_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_events` ADD CONSTRAINT `company_events_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;