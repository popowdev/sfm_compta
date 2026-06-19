CREATE TABLE `fiscal_config` (
	`id` int NOT NULL,
	`dividend_tax_rate` decimal(5,2) NOT NULL DEFAULT '0',
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fiscal_config_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `tax_brackets` (
	`id` int AUTO_INCREMENT NOT NULL,
	`min_amount` decimal(14,2) NOT NULL,
	`max_amount` decimal(14,2),
	`rate` decimal(5,2) NOT NULL,
	`sort_order` int NOT NULL DEFAULT 0,
	CONSTRAINT `tax_brackets_id` PRIMARY KEY(`id`)
);
