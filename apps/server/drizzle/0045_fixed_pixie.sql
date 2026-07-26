CREATE TABLE `company_notes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`author_user_id` int,
	`author_name` varchar(140) NOT NULL DEFAULT '',
	`type` enum('no_answer','not_present','other') NOT NULL DEFAULT 'no_answer',
	`incident_at` datetime NOT NULL,
	`body` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_notes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_notes` ADD CONSTRAINT `company_notes_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_notes` ADD CONSTRAINT `company_notes_author_user_id_users_id_fk` FOREIGN KEY (`author_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;