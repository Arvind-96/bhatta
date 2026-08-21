CREATE TABLE `machine_installment_payments` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`machineId` varchar(64) NOT NULL,
	`amount` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `machine_installment_payments__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `machines` ADD `purchaseDate` datetime;--> statement-breakpoint
ALTER TABLE `machines` ADD `price` double;--> statement-breakpoint
ALTER TABLE `machines` ADD `purchasedByName` varchar(255);--> statement-breakpoint
ALTER TABLE `machines` ADD `purchasedByPhone` varchar(255);--> statement-breakpoint
ALTER TABLE `machines` ADD `warrantyDetails` text;--> statement-breakpoint
ALTER TABLE `machines` ADD `totalPaid` double DEFAULT 0;--> statement-breakpoint
ALTER TABLE `machines` ADD `remainingDue` double DEFAULT 0;--> statement-breakpoint
ALTER TABLE `machines` ADD `tenureMonths` double;--> statement-breakpoint
ALTER TABLE `salary_slips` ADD `advanceDeducted` double DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX `machineinstallment_kiln_machine_idx` ON `machine_installment_payments` (`kilnId`,`machineId`);