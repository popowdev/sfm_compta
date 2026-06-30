CREATE TABLE `announcements` (
	`id` int AUTO_INCREMENT NOT NULL,
	`title` varchar(160) NOT NULL,
	`body` text NOT NULL,
	`pinned` boolean NOT NULL DEFAULT false,
	`created_by_user_id` int,
	`created_by_name` varchar(120) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `announcements_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_listings` (
	`id` int AUTO_INCREMENT NOT NULL,
	`company_id` int NOT NULL,
	`seller_shareholder_id` int,
	`parts` decimal(5,2) NOT NULL,
	`price_per_part` decimal(14,2) NOT NULL DEFAULT '0',
	`note` varchar(250),
	`listing_status` enum('open','closed') NOT NULL DEFAULT 'open',
	`created_by_user_id` int,
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `share_listings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `share_requests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`listing_id` int NOT NULL,
	`buyer_user_id` int,
	`buyer_name` varchar(120) NOT NULL,
	`parts` decimal(5,2) NOT NULL,
	`request_status` enum('pending','accepted','refused') NOT NULL DEFAULT 'pending',
	`created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `share_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `share_listings` ADD CONSTRAINT `share_listings_company_id_companies_id_fk` FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `share_listings` ADD CONSTRAINT `share_listings_seller_shareholder_id_shareholders_id_fk` FOREIGN KEY (`seller_shareholder_id`) REFERENCES `shareholders`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `share_listings` ADD CONSTRAINT `share_listings_created_by_user_id_users_id_fk` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `share_requests` ADD CONSTRAINT `share_requests_listing_id_share_listings_id_fk` FOREIGN KEY (`listing_id`) REFERENCES `share_listings`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `share_requests` ADD CONSTRAINT `share_requests_buyer_user_id_users_id_fk` FOREIGN KEY (`buyer_user_id`) REFERENCES `users`(`id`) ON DELETE set null ON UPDATE no action;