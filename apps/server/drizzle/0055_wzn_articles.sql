CREATE TABLE `wzn_articles` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`title` varchar(150) NOT NULL,
	`type` enum('video','ecrit') NOT NULL DEFAULT 'ecrit',
	`likes` int NOT NULL DEFAULT 0,
	`active` boolean NOT NULL DEFAULT true,
	`start_week` date NOT NULL,
	`weeks` int NOT NULL DEFAULT 4,
	`notes` varchar(255),
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `wzn_articles_id` PRIMARY KEY(`id`)
);
