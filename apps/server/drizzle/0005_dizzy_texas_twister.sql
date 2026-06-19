CREATE TABLE `shareholders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`percentage` decimal(5,2) NOT NULL,
	`share_type` varchar(40) NOT NULL DEFAULT 'ordinaire',
	`anonymous` boolean NOT NULL DEFAULT false,
	`public_name` varchar(120),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `shareholders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `valuation` decimal(14,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `shareholders` ADD CONSTRAINT `shareholders_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;