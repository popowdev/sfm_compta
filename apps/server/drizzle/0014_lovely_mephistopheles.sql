CREATE TABLE `company_employees` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`phone` varchar(50),
	`date_of_birth` date,
	`hire_date` date,
	`position` enum('pdg','patron','co_patron','gerant','employe','apprenti') NOT NULL DEFAULT 'employe',
	`contract_type` enum('cdi','cdd','interim') NOT NULL DEFAULT 'cdi',
	`contract_signed` boolean NOT NULL DEFAULT false,
	`hourly_rate` decimal(10,2) NOT NULL DEFAULT '0',
	`commission_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`warnings` int NOT NULL DEFAULT 0,
	`termination_reason` varchar(255),
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_employees` ADD CONSTRAINT `company_employees_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;