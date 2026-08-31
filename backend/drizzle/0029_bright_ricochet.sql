CREATE TABLE `partner_assets` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`partnerId` varchar(64) NOT NULL,
	`assetType` varchar(20) NOT NULL,
	`description` varchar(255) NOT NULL,
	`landAreaBigha` double,
	`rentalRate` double,
	`rentalRateUnit` varchar(100),
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `partner_assets__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `people` ADD `partnershipDate` datetime;--> statement-breakpoint
ALTER TABLE `people` ADD `commissionType` varchar(30);--> statement-breakpoint
ALTER TABLE `people` ADD `commissionPercent` double;--> statement-breakpoint
ALTER TABLE `invoices` ADD `partnerId` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `agentId` varchar(64);--> statement-breakpoint
CREATE INDEX `partner_asset_kiln_partner_idx` ON `partner_assets` (`kilnId`,`partnerId`);