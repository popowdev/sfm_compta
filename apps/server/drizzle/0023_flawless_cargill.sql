ALTER TABLE `role_permissions` ADD `can_create` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD `can_edit` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `role_permissions` ADD `can_delete` boolean DEFAULT false NOT NULL;