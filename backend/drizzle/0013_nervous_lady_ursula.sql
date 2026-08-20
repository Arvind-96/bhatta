CREATE TABLE `customers` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phones` json DEFAULT ('[]'),
	`addresses` json DEFAULT ('[]'),
	`drivers` json DEFAULT ('[]'),
	`vehicles` json DEFAULT ('[]'),
	`openingPaid` double NOT NULL DEFAULT 0,
	`openingDue` double NOT NULL DEFAULT 0,
	`createdAt` datetime,
	CONSTRAINT `customers__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `invoices` MODIFY COLUMN `dispatchId` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `customerId` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `amountPaidNow` double;--> statement-breakpoint
CREATE INDEX `customer_kiln_idx` ON `customers` (`kilnId`);--> statement-breakpoint
CREATE INDEX `invoice_kiln_customer_idx` ON `invoices` (`kilnId`,`customerId`);