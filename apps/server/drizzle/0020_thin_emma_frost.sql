CREATE TABLE `company_rentals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`client_name` varchar(150) NOT NULL,
	`client_phone` varchar(50),
	`label` varchar(150) NOT NULL,
	`event_date` date NOT NULL,
	`event_time` varchar(20),
	`duration_hours` int,
	`rental_price` decimal(12,2) NOT NULL DEFAULT '0',
	`deposit` decimal(12,2) NOT NULL DEFAULT '0',
	`deposit_status` enum('paid','returned','kept') NOT NULL DEFAULT 'paid',
	`status` enum('reserved','active','completed','cancelled') NOT NULL DEFAULT 'reserved',
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_rentals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_rentals` ADD CONSTRAINT `company_rentals_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_rentals` ADD CONSTRAINT `company_rentals_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;