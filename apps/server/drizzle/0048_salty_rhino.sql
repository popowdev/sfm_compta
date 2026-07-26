CREATE TABLE `vehicle_models` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`manufacturer` varchar(80),
	`category` varchar(40),
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `vehicle_models_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `idx_vehicle_model_name` ON `vehicle_models` (`name`);