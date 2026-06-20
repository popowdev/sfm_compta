CREATE TABLE `stock_categories` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(80) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_categories_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_stock_category` UNIQUE(`company_id`,`name`)
);
--> statement-breakpoint
ALTER TABLE `catalog_items` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `stock_items` ADD `category_id` int;--> statement-breakpoint
ALTER TABLE `stock_categories` ADD CONSTRAINT `stock_categories_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `catalog_items` ADD CONSTRAINT `catalog_items_category_id_stock_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `stock_categories`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_category_id_stock_categories_id_fk` FOREIGN KEY (`category_id`) REFERENCES `stock_categories`(`id`) ON DELETE set null ON UPDATE no action;