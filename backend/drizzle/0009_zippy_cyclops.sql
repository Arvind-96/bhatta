CREATE TABLE `labour_sessions` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`contractorId` varchar(64) NOT NULL,
	`numberOfLaborers` int NOT NULL DEFAULT 0,
	`farePerLaborer` double NOT NULL DEFAULT 0,
	`advancePerLaborer` double NOT NULL DEFAULT 0,
	`carriedForwardAmount` double NOT NULL DEFAULT 0,
	`startDate` datetime,
	`endDate` datetime,
	`createdAt` datetime,
	CONSTRAINT `labour_sessions__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE INDEX `labour_session_kiln_contractor_idx` ON `labour_sessions` (`kilnId`,`contractorId`);