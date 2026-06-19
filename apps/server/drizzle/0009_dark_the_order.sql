CREATE TABLE `declarations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`week_label` varchar(60) NOT NULL,
	`declarant_name` varchar(120) NOT NULL,
	`ca_net` decimal(14,2) NOT NULL,
	`charges` decimal(14,2) NOT NULL,
	`benefit` decimal(14,2) NOT NULL,
	`corporate_tax` decimal(14,2) NOT NULL,
	`dividends` decimal(14,2) NOT NULL,
	`dividend_tax` decimal(14,2) NOT NULL,
	`total_tax` decimal(14,2) NOT NULL,
	`status` enum('submitted','paid','cancelled') NOT NULL DEFAULT 'submitted',
	`declared_by_user_id` int,
	`email` varchar(150),
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`paid_at` timestamp,
	CONSTRAINT `declarations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `declarations` ADD CONSTRAINT `declarations_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `declarations` ADD CONSTRAINT `declarations_declared_by_user_id_users_id_fk` FOREIGN KEY (`declared_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;