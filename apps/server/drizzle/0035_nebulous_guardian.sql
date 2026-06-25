CREATE TABLE `association_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`association_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`url` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size` int NOT NULL DEFAULT 0,
	`uploaded_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `association_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `association_members` (
	`id` int AUTO_INCREMENT NOT NULL,
	`association_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('president','tresorier','secretaire','membre') NOT NULL DEFAULT 'membre',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `association_members_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_association_member` UNIQUE(`association_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `association_transactions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`association_id` int NOT NULL,
	`type` enum('cotisation','don','subvention','depense','autre') NOT NULL,
	`label` varchar(200) NOT NULL,
	`amount` decimal(14,2) NOT NULL,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `association_transactions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `associations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`slug` varchar(140) NOT NULL,
	`objet` varchar(250),
	`logo_url` varchar(255),
	`status` enum('active','dissolved') NOT NULL DEFAULT 'active',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `associations_id` PRIMARY KEY(`id`),
	CONSTRAINT `associations_slug_unique` UNIQUE(`slug`)
);
--> statement-breakpoint
ALTER TABLE `association_documents` ADD CONSTRAINT `association_documents_association_id_associations_id_fk` FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `association_documents` ADD CONSTRAINT `association_documents_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `association_members` ADD CONSTRAINT `association_members_association_id_associations_id_fk` FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `association_members` ADD CONSTRAINT `association_members_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `association_transactions` ADD CONSTRAINT `association_transactions_association_id_associations_id_fk` FOREIGN KEY (`association_id`) REFERENCES `associations`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `association_transactions` ADD CONSTRAINT `association_transactions_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;