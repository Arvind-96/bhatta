CREATE TABLE `expense_types` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`openingPaid` double NOT NULL DEFAULT 0,
	`openingDue` double NOT NULL DEFAULT 0,
	`createdAt` datetime,
	CONSTRAINT `expense_types__id` PRIMARY KEY(`_id`),
	CONSTRAINT `expensetype_kiln_name_unique` UNIQUE(`kilnId`,`name`)
);
--> statement-breakpoint
ALTER TABLE `expenses` MODIFY COLUMN `category` varchar(50);--> statement-breakpoint
ALTER TABLE `expenses` ADD `expenseTypeId` varchar(64);--> statement-breakpoint
ALTER TABLE `expenses` ADD `quantity` double;--> statement-breakpoint
CREATE INDEX `expensetype_kiln_idx` ON `expense_types` (`kilnId`);--> statement-breakpoint
CREATE INDEX `expense_kiln_expensetype_idx` ON `expenses` (`kilnId`,`expenseTypeId`);