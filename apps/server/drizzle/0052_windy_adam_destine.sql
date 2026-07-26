CREATE TABLE `garage_contract_prices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contract_id` int NOT NULL,
	`type_id` int,
	`pack_id` int,
	`price` decimal(12,2) NOT NULL DEFAULT '0',
	CONSTRAINT `garage_contract_prices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `garage_contract_prices` ADD CONSTRAINT `garage_contract_prices_contract_id_garage_contracts_id_fk` FOREIGN KEY (`contract_id`) REFERENCES `garage_contracts`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_contract_prices` ADD CONSTRAINT `garage_contract_prices_type_id_garage_repair_types_id_fk` FOREIGN KEY (`type_id`) REFERENCES `garage_repair_types`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `garage_contract_prices` ADD CONSTRAINT `garage_contract_prices_pack_id_garage_packs_id_fk` FOREIGN KEY (`pack_id`) REFERENCES `garage_packs`(`id`) ON DELETE cascade ON UPDATE no action;