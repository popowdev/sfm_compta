CREATE TABLE `module_settings` (
	`module_key` enum('declarations','bareme','dividendes','actionnaires','subventions','messagerie','caisse','clients','stocks','rh','badgeuse','exercices','depenses','locations','tickets','stats') NOT NULL,
	`label` varchar(100),
	`group_name` varchar(80),
	`blocked` boolean NOT NULL DEFAULT false,
	`sort_order` int,
	`updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `module_settings_module_key` PRIMARY KEY(`module_key`)
);
