CREATE TABLE `company_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(200) NOT NULL,
	`url` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size` int NOT NULL DEFAULT 0,
	`uploaded_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `company_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `irs_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(200) NOT NULL,
	`url` varchar(255) NOT NULL,
	`mime_type` varchar(120) NOT NULL,
	`size` int NOT NULL DEFAULT 0,
	`uploaded_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `irs_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_modules` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents') NOT NULL;--> statement-breakpoint
ALTER TABLE `module_settings` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents') NOT NULL;--> statement-breakpoint
ALTER TABLE `role_permissions` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents') NOT NULL;--> statement-breakpoint
ALTER TABLE `role_special_permissions` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents') NOT NULL;--> statement-breakpoint
ALTER TABLE `company_documents` ADD CONSTRAINT `company_documents_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `company_documents` ADD CONSTRAINT `company_documents_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `irs_documents` ADD CONSTRAINT `irs_documents_uploaded_by_user_id_users_id_fk` FOREIGN KEY (`uploaded_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
INSERT INTO `role_permissions` (`company_role_id`, `module_key`, `can_view`, `can_write`, `can_create`, `can_edit`, `can_delete`)
SELECT cr.`id`, 'documents', 1, cr.`can_manage`, cr.`can_manage`, cr.`can_manage`, cr.`can_manage`
FROM `company_roles` cr
WHERE NOT EXISTS (
  SELECT 1 FROM `role_permissions` rp WHERE rp.`company_role_id` = cr.`id` AND rp.`module_key` = 'documents'
);