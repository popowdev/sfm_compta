CREATE TABLE `subventions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`motif` varchar(200) NOT NULL,
	`requester_name` varchar(120) NOT NULL,
	`amount_requested` decimal(14,2) NOT NULL,
	`amount_granted` decimal(14,2),
	`status` enum('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
	`requested_by_user_id` int,
	`notes` text,
	`decided_at` timestamp,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subventions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `subventions` ADD CONSTRAINT `subventions_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `subventions` ADD CONSTRAINT `subventions_requested_by_user_id_users_id_fk` FOREIGN KEY (`requested_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;