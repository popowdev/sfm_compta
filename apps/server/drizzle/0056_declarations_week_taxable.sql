ALTER TABLE `declarations` ADD `week_start` date;--> statement-breakpoint
ALTER TABLE `declarations` ADD `taxable_benefit` decimal(14,2);--> statement-breakpoint
UPDATE `declarations` SET `week_start` = STR_TO_DATE(SUBSTRING(`week_label`, 12, 10), '%d/%m/%Y') WHERE `week_label` REGEXP '^Semaine du [0-9]{2}/[0-9]{2}/[0-9]{4} au ';
