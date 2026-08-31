CREATE TABLE `pathai_sites` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`distanceKm` double,
	`notes` text,
	`active` boolean DEFAULT true,
	`createdAt` datetime,
	CONSTRAINT `pathai_sites__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `salt_usage_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`siteId` varchar(64) NOT NULL,
	`quantityKg` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `salt_usage_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `molding_entries` ADD `siteId` varchar(64);--> statement-breakpoint
ALTER TABLE `stacking_entries` ADD `siteId` varchar(64);--> statement-breakpoint
ALTER TABLE `soil_trips` ADD `siteId` varchar(64);--> statement-breakpoint
CREATE INDEX `pathaisite_kiln_active_idx` ON `pathai_sites` (`kilnId`,`active`);--> statement-breakpoint
CREATE INDEX `saltusage_kiln_date_idx` ON `salt_usage_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `molding_kiln_site_idx` ON `molding_entries` (`kilnId`,`siteId`);--> statement-breakpoint
CREATE INDEX `stacking_kiln_site_idx` ON `stacking_entries` (`kilnId`,`siteId`);--> statement-breakpoint
CREATE INDEX `soiltrip_kiln_site_idx` ON `soil_trips` (`kilnId`,`siteId`);