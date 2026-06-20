CREATE TABLE `sale_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sale_id` int NOT NULL,
	`company_id` int NOT NULL,
	`catalog_item_id` int,
	`name` varchar(150) NOT NULL,
	`item_type` enum('product','service') NOT NULL DEFAULT 'service',
	`unit_price` decimal(12,2) NOT NULL DEFAULT '0',
	`quantity` decimal(12,3) NOT NULL DEFAULT '0',
	`line_total` decimal(14,2) NOT NULL DEFAULT '0',
	`production_cost` decimal(14,2) NOT NULL DEFAULT '0',
	CONSTRAINT `sale_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sales` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`employee_id` int,
	`client_id` int,
	`subtotal` decimal(14,2) NOT NULL DEFAULT '0',
	`discount` decimal(14,2) NOT NULL DEFAULT '0',
	`total` decimal(14,2) NOT NULL DEFAULT '0',
	`production_cost` decimal(14,2) NOT NULL DEFAULT '0',
	`payment_method` enum('cash','card','transfer','account') NOT NULL DEFAULT 'cash',
	`points_awarded` int NOT NULL DEFAULT 0,
	`notes` varchar(300),
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `sales_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stock_movements` ADD `sale_id` int;--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_sale_id_sales_id_fk` FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sale_items` ADD CONSTRAINT `sale_items_catalog_item_id_catalog_items_id_fk` FOREIGN KEY (`catalog_item_id`) REFERENCES `catalog_items`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_employee_id_company_employees_id_fk` FOREIGN KEY (`employee_id`) REFERENCES `company_employees`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_client_id_company_clients_id_fk` FOREIGN KEY (`client_id`) REFERENCES `company_clients`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `sales` ADD CONSTRAINT `sales_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;