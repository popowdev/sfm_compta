CREATE TABLE `company_modules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`config` json,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `company_modules_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_company_module` UNIQUE(`company_id`,`module_key`)
);
--> statement-breakpoint
CREATE TABLE `memberships` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('pdg','patron','co_patron','gerant','employe') NOT NULL DEFAULT 'employe',
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `memberships_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_company_user` UNIQUE(`company_id`,`user_id`)
);
--> statement-breakpoint
CREATE TABLE `user_app_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`role` enum('irs','staff','gouvernement') NOT NULL,
	CONSTRAINT `user_app_roles_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_user_role` UNIQUE(`user_id`,`role`)
);
--> statement-breakpoint
ALTER TABLE `companies` ADD `logo_url` varchar(255);--> statement-breakpoint
ALTER TABLE `companies` ADD `fivem_job` varchar(64);--> statement-breakpoint
ALTER TABLE `companies` ADD `external_link` varchar(255);--> statement-breakpoint
ALTER TABLE `companies` ADD `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `companies` ADD `deleted_at` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `last_whitelist_check` timestamp;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL ON UPDATE CURRENT_TIMESTAMP;--> statement-breakpoint
ALTER TABLE `companies` ADD CONSTRAINT `companies_fivem_job_unique` UNIQUE(`fivem_job`);--> statement-breakpoint
ALTER TABLE `company_modules` ADD CONSTRAINT `company_modules_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `memberships` ADD CONSTRAINT `memberships_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `user_app_roles` ADD CONSTRAINT `user_app_roles_user_id_users_id_fk` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE cascade ON UPDATE no action;