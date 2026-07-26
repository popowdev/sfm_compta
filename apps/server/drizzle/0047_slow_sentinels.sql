ALTER TABLE `garage_customs` ADD `mechanic_user_id` int;--> statement-breakpoint
ALTER TABLE `garage_customs` ADD `commission_amount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD `mechanic_user_id` int;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD `commission_amount` decimal(12,2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE `garage_settings` ADD `commission_pct` decimal(6,2) DEFAULT '30' NOT NULL;--> statement-breakpoint
ALTER TABLE `garage_repair_types` ADD CONSTRAINT `uq_garage_type` UNIQUE(`company_id`,`name`);--> statement-breakpoint
ALTER TABLE `garage_customs` ADD CONSTRAINT `garage_customs_mechanic_user_id_users_id_fk` FOREIGN KEY (`mechanic_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_repairs` ADD CONSTRAINT `garage_repairs_mechanic_user_id_users_id_fk` FOREIGN KEY (`mechanic_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;