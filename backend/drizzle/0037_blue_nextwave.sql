CREATE TABLE `labor_report_runs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`periodStart` datetime NOT NULL,
	`periodEnd` datetime NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `labor_report_runs__id` PRIMARY KEY(`_id`),
	CONSTRAINT `laborreportrun_kiln_period_unique` UNIQUE(`kilnId`,`periodStart`,`periodEnd`)
);
--> statement-breakpoint
ALTER TABLE `kilns` ADD `laborReportScheduleDays` json;