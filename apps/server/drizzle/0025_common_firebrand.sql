CREATE TABLE `role_special_permissions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_role_id` int NOT NULL,
	`module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats') NOT NULL,
	`action_key` varchar(48) NOT NULL,
	`granted` boolean NOT NULL DEFAULT false,
	CONSTRAINT `role_special_permissions_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_role_special` UNIQUE(`company_role_id`,`module_key`,`action_key`)
);
--> statement-breakpoint
ALTER TABLE `role_special_permissions` ADD CONSTRAINT `role_special_permissions_company_role_id_company_roles_id_fk` FOREIGN KEY (`company_role_id`) REFERENCES `company_roles`(`id`) ON DELETE cascade ON UPDATE no action;