CREATE TABLE `exercice_payroll` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`exercice_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`commission` decimal(12,2) NOT NULL DEFAULT '0',
	`bonus` decimal(12,2) NOT NULL DEFAULT '0',
	`deductions` decimal(12,2) NOT NULL DEFAULT '0',
	`notes` varchar(200),
	CONSTRAINT `exercice_payroll_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_exercice_payroll` UNIQUE(`exercice_id`,`employee_id`)
);
--> statement-breakpoint
ALTER TABLE `exercices` ADD `hours_cap` decimal(10,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `exercices` ADD `salary_cap` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `exercice_payroll` ADD CONSTRAINT `exercice_payroll_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercice_payroll` ADD CONSTRAINT `exercice_payroll_exercice_id_exercices_id_fk` FOREIGN KEY (`exercice_id`) REFERENCES `exercices`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `exercice_payroll` ADD CONSTRAINT `exercice_payroll_employee_id_company_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `company_employees`(`id`) ON DELETE cascade ON UPDATE no action;