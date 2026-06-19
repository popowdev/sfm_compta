CREATE TABLE `company_expenses` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`label` varchar(200) NOT NULL,
	`category` enum('salary','vehicle','meal','supply','rent','other') NOT NULL DEFAULT 'other',
	`amount` decimal(14,2) NOT NULL,
	`tax_deductible` boolean NOT NULL DEFAULT false,
	`expense_date` date NOT NULL,
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_expenses` ADD CONSTRAINT `company_expenses_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_expenses` ADD CONSTRAINT `company_expenses_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;