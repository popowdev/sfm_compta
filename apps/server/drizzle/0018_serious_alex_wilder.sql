CREATE TABLE `salary_grid` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`position` enum('pdg','patron','co_patron','gerant','employe','apprenti') NOT NULL,
	`hourly_rate` decimal(10,2) NOT NULL DEFAULT '0',
	`base_salary` decimal(12,2) NOT NULL DEFAULT '0',
	CONSTRAINT `salary_grid_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_salary_grid` UNIQUE(`company_id`,`position`)
);
--> statement-breakpoint
ALTER TABLE `salary_grid` ADD CONSTRAINT `salary_grid_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;