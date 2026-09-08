CREATE TABLE `garage_contract_payments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`contract_id` int NOT NULL,
	`week_start` date NOT NULL,
	`paid` boolean NOT NULL DEFAULT false,
	`paid_at` timestamp,
	`paid_by_user_id` int,
	CONSTRAINT `garage_contract_payments_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_garage_contract_payment` UNIQUE(`contract_id`,`week_start`)
);
--> statement-breakpoint
ALTER TABLE `garage_contract_payments` ADD CONSTRAINT `garage_contract_payments_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `garage_contract_payments` ADD CONSTRAINT `garage_contract_payments_contract_id_garage_contracts_id_fk` FOREIGN KEY (`contract_id`) REFERENCES `garage_contracts`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `garage_contract_payments` ADD CONSTRAINT `garage_contract_payments_paid_by_user_id_users_id_fk` FOREIGN KEY (`paid_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;
