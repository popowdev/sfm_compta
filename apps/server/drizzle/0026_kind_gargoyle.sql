CREATE TABLE `stock_items` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`name` varchar(150) NOT NULL,
	`category` varchar(80),
	`unit` enum('piece','kg','g','liter','cl','box','pack','other') NOT NULL DEFAULT 'piece',
	`quantity` decimal(12,3) NOT NULL DEFAULT '0',
	`unit_cost` decimal(12,2) NOT NULL DEFAULT '0',
	`low_stock_threshold` decimal(12,3) NOT NULL DEFAULT '0',
	`notes` text,
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_items_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `stock_movements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`stock_item_id` int NOT NULL,
	`type` enum('in','out','adjust') NOT NULL,
	`quantity` decimal(12,3) NOT NULL,
	`unit_cost` decimal(12,2),
	`supplier` varchar(150),
	`reason` varchar(200),
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `stock_movements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_items` ADD CONSTRAINT `stock_items_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_stock_item_id_stock_items_id_fk` FOREIGN KEY (`stock_item_id`) REFERENCES `stock_items`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `stock_movements` ADD CONSTRAINT `stock_movements_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;