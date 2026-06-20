CREATE TABLE `catalog_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` varchar(80),
	`type` enum('product','service') NOT NULL DEFAULT 'product',
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `catalog_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `catalog_recipe` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`catalog_item_id` int NOT NULL,
	`stock_item_id` int NOT NULL,
	`quantity` decimal(12,3) NOT NULL DEFAULT '0',
	CONSTRAINT `catalog_recipe_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_catalog_recipe` UNIQUE(`catalog_item_id`,`stock_item_id`)
);
--> statement-breakpoint
ALTER TABLE `catalog_items` ADD CONSTRAINT `catalog_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_items` ADD CONSTRAINT `catalog_items_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_recipe` ADD CONSTRAINT `catalog_recipe_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_recipe` ADD CONSTRAINT `catalog_recipe_catalog_item_id_catalog_items_id_fk` FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_recipe` ADD CONSTRAINT `catalog_recipe_stock_item_id_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON DELETE cascade ON UPDATE no action;