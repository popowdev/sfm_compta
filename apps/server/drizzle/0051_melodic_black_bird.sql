CREATE TABLE `fivem_characters` (
	`id` int AUTO_INCREMENT NOT NULL,
	`discord_id` varchar(32) NOT NULL,
	`name` varchar(120) NOT NULL,
	`job_id` varchar(64) NOT NULL DEFAULT '',
	`job_label` varchar(120),
	`grade` int NOT NULL DEFAULT 0,
	`grade_label` varchar(120),
	`unemployed` boolean NOT NULL DEFAULT false,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `fivem_characters_id` PRIMARY KEY(`id`),
	CONSTRAINT `uq_fivem_char` UNIQUE(`discord_id`,`name`)
);
