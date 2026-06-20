CREATE TABLE `client_loyalty_tiers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`tier` enum('bronze','silver','gold','platinum') NOT NULL,
	`name` varchar(60) NOT NULL,
	`threshold` int NOT NULL DEFAULT 0,
	CONSTRAINT `client_loyalty_tiers_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_loyalty_tier` UNIQUE(`company_id`,`tier`)
);
--> statement-breakpoint
ALTER TABLE `client_loyalty_tiers` ADD CONSTRAINT `client_loyalty_tiers_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;