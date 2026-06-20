CREATE TABLE `exercices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`label` varchar(150) NOT NULL,
	`start_date` date NOT NULL,
	`end_date` date NOT NULL,
	`status` enum('open','closed') NOT NULL DEFAULT 'open',
	`revenue` decimal(14,2) NOT NULL DEFAULT '0',
	`dividends` decimal(14,2) NOT NULL DEFAULT '0',
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `exercices_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_exercice_period` UNIQUE(`company_id`,`start_date`,`end_date`)
);
--> statement-breakpoint
ALTER TABLE `exercices` ADD CONSTRAINT `exercices_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercices` ADD CONSTRAINT `exercices_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;