CREATE TABLE `fivem_players` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discord_id` varchar(32) NOT NULL,
	`identifier` varchar(80),
	`name` varchar(120) NOT NULL DEFAULT '',
	`job` varchar(64) NOT NULL DEFAULT '',
	`job_grade` int NOT NULL DEFAULT 0,
	`online` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fivem_players_id` PRIMARY KEY(`id`),
	CONSTRAINT `fivem_players_discord_id_unique` UNIQUE(`discord_id`)
);
--> statement-breakpoint
ALTER TABLE `company_roles` ADD `fivem_grade` int;