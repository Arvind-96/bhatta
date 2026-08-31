CREATE TABLE `land_lease_contracts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`contractNumber` varchar(255) NOT NULL,
	`landId` varchar(64) NOT NULL,
	`landLeaseId` varchar(64) NOT NULL,
	`rateType` varchar(50) DEFAULT 'PER_BIGHA',
	`contractedQuantity` double,
	`ratePerTrolley` double,
	`contractedAreaBigha` double,
	`ratePerBigha` double,
	`contractedDepth` double,
	`depthUnit` varchar(50) DEFAULT 'feet',
	`ratePerDepthUnit` double,
	`totalContractValue` double NOT NULL,
	`advanceAmount` double DEFAULT 0,
	`startDate` datetime,
	`endDate` datetime,
	`paymentTerms` text,
	`status` varchar(50) DEFAULT 'ACTIVE',
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `land_lease_contracts__id` PRIMARY KEY(`_id`),
	CONSTRAINT `landlease_contract_kiln_number_unique` UNIQUE(`kilnId`,`contractNumber`)
);
--> statement-breakpoint
CREATE INDEX `landlease_contract_kiln_land_idx` ON `land_lease_contracts` (`kilnId`,`landId`);--> statement-breakpoint
CREATE INDEX `landlease_contract_kiln_lease_idx` ON `land_lease_contracts` (`kilnId`,`landLeaseId`);