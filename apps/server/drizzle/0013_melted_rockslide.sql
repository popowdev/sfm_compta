CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`body` text NOT NULL,
	`from_irs` boolean NOT NULL DEFAULT false,
	`sender_user_id` int,
	`sender_name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `messages` ADD CONSTRAINT `messages_sender_user_id_users_id_fk` FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;