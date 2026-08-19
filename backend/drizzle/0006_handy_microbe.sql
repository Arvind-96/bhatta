CREATE TABLE `sand_contracts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`contractNumber` varchar(255) NOT NULL,
	`sandContractorId` varchar(64) NOT NULL,
	`rateType` varchar(50) DEFAULT 'PER_TROLLEY',
	`contractedTrolleys` double,
	`totalContractValue` double NOT NULL,
	`advanceAmount` double DEFAULT 0,
	`startDate` datetime,
	`endDate` datetime,
	`createdAt` datetime,
	CONSTRAINT `sand_contracts__id` PRIMARY KEY(`_id`),
	CONSTRAINT `sand_contract_kiln_number_unique` UNIQUE(`kilnId`,`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `sand_deliveries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`sandContractorId` varchar(64) NOT NULL,
	`contractId` varchar(64),
	`tractorUsed` boolean DEFAULT false,
	`tractors` json,
	`trolleyCount` int NOT NULL,
	`paymentGiven` double DEFAULT 0,
	`paymentPending` double DEFAULT 0,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `sand_deliveries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `people` ADD `sandContractorSerial` int;--> statement-breakpoint
CREATE INDEX `sand_contract_kiln_contractor_idx` ON `sand_contracts` (`kilnId`,`sandContractorId`);--> statement-breakpoint
CREATE INDEX `sanddelivery_kiln_date_idx` ON `sand_deliveries` (`kilnId`,`date`);