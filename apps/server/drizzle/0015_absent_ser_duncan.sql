CREATE TABLE `time_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int NOT NULL,
	`clock_in` datetime NOT NULL,
	`clock_out` datetime,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `time_entries_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `time_entries` ADD CONSTRAINT `time_entries_employee_id_company_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `company_employees`(`id`) ON DELETE cascade ON UPDATE no action;