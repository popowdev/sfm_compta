CREATE TABLE `company_clients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(150) NOT NULL,
	`phone` varchar(50),
	`email` varchar(150),
	`notes` text,
	`loyalty_tier` enum('bronze','silver','gold','platinum') NOT NULL DEFAULT 'bronze',
	`loyalty_points` int NOT NULL DEFAULT 0,
	`total_spent` decimal(12,2) NOT NULL DEFAULT '0',
	`account_balance` decimal(12,2) NOT NULL DEFAULT '0',
	`credit_limit` decimal(12,2) NOT NULL DEFAULT '0',
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_clients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_clients` ADD CONSTRAINT `company_clients_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_clients` ADD CONSTRAINT `company_clients_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;