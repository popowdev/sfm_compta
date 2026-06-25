CREATE TABLE `subvention_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`subvention_id` int NOT NULL,
	`url` varchar(255) NOT NULL,
	`name` varchar(200) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `subvention_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `subventions` ADD `type` enum('evenement','contrat','badgeuse','autre') DEFAULT 'evenement' NOT NULL;--> statement-breakpoint
ALTER TABLE `subventions` ADD `photo_url` varchar(255);--> statement-breakpoint
ALTER TABLE `subvention_documents` ADD CONSTRAINT `subvention_documents_subvention_id_subventions_id_fk` FOREIGN KEY (`subvention_id`) REFERENCES `subventions`(`id`) ON DELETE cascade ON UPDATE no action;