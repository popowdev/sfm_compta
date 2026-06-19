CREATE TABLE `company_roles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(60) NOT NULL,
	`rank` int NOT NULL DEFAULT 0,
	`is_default` boolean NOT NULL DEFAULT false,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_roles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `role_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_role_id` int NOT NULL,
	`module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats') NOT NULL,
	`can_view` boolean NOT NULL DEFAULT false,
	`can_write` boolean NOT NULL DEFAULT false,
	CONSTRAINT `role_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_role_module` UNIQUE(`company_role_id`,`module_key`)
);
--> statement-breakpoint
ALTER TABLE `company_roles` ADD CONSTRAINT `company_roles_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD CONSTRAINT `role_permissions_company_role_id_company_roles_id_fk` FOREIGN KEY (`company_role_id`) REFERENCES `company_roles`(`id`) ON DELETE cascade ON UPDATE no action;