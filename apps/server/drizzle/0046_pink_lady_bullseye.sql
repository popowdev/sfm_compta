CREATE TABLE `garage_contracts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(120) NOT NULL,
	`description` text,
	`active` boolean NOT NULL DEFAULT true,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `garage_contracts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garage_customs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`contract_id` int,
	`vehicle_id` int,
	`mechanic_name` varchar(140) NOT NULL DEFAULT '',
	`client_name` varchar(140),
	`plate` varchar(20),
	`model` varchar(120),
	`cost_price` decimal(12,2) NOT NULL DEFAULT '0',
	`discount_pct` decimal(6,2) NOT NULL DEFAULT '0',
	`margin_pct` decimal(6,2) NOT NULL DEFAULT '25',
	`final_price` decimal(12,2) NOT NULL DEFAULT '0',
	`profit` decimal(12,2) NOT NULL DEFAULT '0',
	`description` text,
	`paid` boolean NOT NULL DEFAULT false,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `garage_customs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garage_packs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `garage_packs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garage_repair_types` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	`sort_order` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	CONSTRAINT `garage_repair_types_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garage_repairs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`contract_id` int,
	`vehicle_id` int,
	`mechanic_name` varchar(140) NOT NULL DEFAULT '',
	`client_name` varchar(140),
	`plate` varchar(20),
	`model` varchar(120),
	`pack_name` varchar(80),
	`items` json,
	`depannage_km` int NOT NULL DEFAULT 0,
	`total` decimal(12,2) NOT NULL DEFAULT '0',
	`description` text,
	`paid` boolean NOT NULL DEFAULT false,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `garage_repairs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `garage_settings` (
	`company_id` int NOT NULL,
	`depannage_per_km` decimal(12,2) NOT NULL DEFAULT '25',
	`depannage_multiplier` int NOT NULL DEFAULT 2,
	`custom_margin_pct` decimal(6,2) NOT NULL DEFAULT '25',
	CONSTRAINT `garage_settings_company_id` PRIMARY KEY(`company_id`)
);
--> statement-breakpoint
CREATE TABLE `garage_vehicles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`owner_first_name` varchar(80),
	`owner_last_name` varchar(80),
	`model` varchar(120),
	`plate` varchar(20) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `garage_vehicles_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `company_modules` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents','garage') NOT NULL;--> statement-breakpoint
ALTER TABLE `module_settings` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents','garage') NOT NULL;--> statement-breakpoint
ALTER TABLE `role_permissions` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents','garage') NOT NULL;--> statement-breakpoint
ALTER TABLE `role_special_permissions` MODIFY COLUMN `module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats','documents','garage') NOT NULL;--> statement-breakpoint
ALTER TABLE `garage_contracts` ADD CONSTRAINT `garage_contracts_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_customs` ADD CONSTRAINT `garage_customs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_customs` ADD CONSTRAINT `garage_customs_contract_id_garage_contracts_id_fk` FOREIGN KEY (`contract_id`) REFERENCES `garage_contracts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_customs` ADD CONSTRAINT `garage_customs_vehicle_id_garage_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `garage_vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_customs` ADD CONSTRAINT `garage_customs_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_packs` ADD CONSTRAINT `garage_packs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repair_types` ADD CONSTRAINT `garage_repair_types_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD CONSTRAINT `garage_repairs_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD CONSTRAINT `garage_repairs_contract_id_garage_contracts_id_fk` FOREIGN KEY (`contract_id`) REFERENCES `garage_contracts`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD CONSTRAINT `garage_repairs_vehicle_id_garage_vehicles_id_fk` FOREIGN KEY (`vehicle_id`) REFERENCES `garage_vehicles`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD CONSTRAINT `garage_repairs_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_settings` ADD CONSTRAINT `garage_settings_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_vehicles` ADD CONSTRAINT `garage_vehicles_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO `company_modules` (`company_id`, `module_key`, `enabled`)
SELECT c.`id`, 'garage', 0 FROM `companies` c
WHERE NOT EXISTS (SELECT 1 FROM `company_modules` cm WHERE cm.`company_id`=c.`id` AND cm.`module_key`='garage');
--> statement-breakpoint
INSERT INTO `role_permissions` (`company_role_id`, `module_key`, `can_view`, `can_write`, `can_create`, `can_edit`, `can_delete`)
SELECT cr.`id`, 'garage', 1, cr.`can_manage`, cr.`can_manage`, cr.`can_manage`, cr.`can_manage`
FROM `company_roles` cr
WHERE NOT EXISTS (SELECT 1 FROM `role_permissions` rp WHERE rp.`company_role_id`=cr.`id` AND rp.`module_key`='garage');
