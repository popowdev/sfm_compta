CREATE TABLE `dividend_payouts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`shareholder_name` varchar(150) NOT NULL,
	`rib` varchar(40),
	`gross` decimal(14,2) NOT NULL DEFAULT '0',
	`tax_rate` decimal(5,2) NOT NULL DEFAULT '33',
	`tax` decimal(14,2) NOT NULL DEFAULT '0',
	`net` decimal(14,2) NOT NULL DEFAULT '0',
	`notes` varchar(300),
	`declared_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `dividend_payouts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `dividend_payouts` ADD CONSTRAINT `dividend_payouts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `dividend_payouts` ADD CONSTRAINT `dividend_payouts_declared_by_user_id_users_id_fk` FOREIGN KEY (`declared_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;