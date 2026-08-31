CREATE TABLE `gher_cycles` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`gherId` varchar(64) NOT NULL,
	`cycleNumber` int NOT NULL,
	`stackingStartedAt` datetime,
	`firingStartedAt` datetime,
	`readyAt` datetime,
	`unloadingStartedAt` datetime,
	`completedAt` datetime,
	`createdAt` datetime,
	CONSTRAINT `gher_cycles__id` PRIMARY KEY(`_id`),
	CONSTRAINT `ghercycle_gher_cyclenum_unique` UNIQUE(`gherId`,`cycleNumber`)
);
--> statement-breakpoint
CREATE TABLE `sale_orders` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`customerId` varchar(64),
	`customerName` varchar(255) NOT NULL,
	`customerAddress` varchar(255),
	`customerPhone` varchar(255),
	`categoryId` varchar(64),
	`items` json,
	`bricksCount` int NOT NULL,
	`bricksFulfilled` int NOT NULL DEFAULT 0,
	`ratePerBrick` double,
	`estimatedAmount` double,
	`status` varchar(30) NOT NULL DEFAULT 'PENDING',
	`sequenceNumber` int,
	`orderDate` datetime,
	`expectedDeliveryDate` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `sale_orders__id` PRIMARY KEY(`_id`),
	CONSTRAINT `saleorder_kiln_sequence_unique` UNIQUE(`kilnId`,`seasonId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `purchase_orders` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`supplierId` varchar(64) NOT NULL,
	`items` json DEFAULT ('[]'),
	`expectedAmount` double,
	`status` varchar(30) NOT NULL DEFAULT 'PENDING',
	`sequenceNumber` int,
	`orderDate` datetime,
	`expectedDeliveryDate` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `purchase_orders__id` PRIMARY KEY(`_id`),
	CONSTRAINT `purchaseorder_kiln_sequence_unique` UNIQUE(`kilnId`,`seasonId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `bank_accounts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`bankName` varchar(255) NOT NULL,
	`accountLabel` varchar(255),
	`accountNumberLast4` varchar(10),
	`openingBalance` double NOT NULL DEFAULT 0,
	`openingBalanceDate` datetime,
	`createdAt` datetime,
	CONSTRAINT `bank_accounts__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `bank_transactions` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`bankAccountId` varchar(64) NOT NULL,
	`date` datetime,
	`description` text,
	`amount` double NOT NULL,
	`direction` varchar(10) NOT NULL,
	`reconciled` boolean NOT NULL DEFAULT false,
	`matchedLedgerEntryId` varchar(64),
	`matchedInvoiceId` varchar(64),
	`matchedExpenseId` varchar(64),
	`matchedSupplierInvoiceId` varchar(64),
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `bank_transactions__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `dispatches` ADD `saleOrderId` varchar(64);--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `purchaseOrderId` varchar(64);--> statement-breakpoint
CREATE INDEX `ghercycle_kiln_gher_idx` ON `gher_cycles` (`kilnId`,`gherId`);--> statement-breakpoint
CREATE INDEX `saleorder_kiln_status_idx` ON `sale_orders` (`kilnId`,`status`);--> statement-breakpoint
CREATE INDEX `purchaseorder_kiln_status_idx` ON `purchase_orders` (`kilnId`,`status`);--> statement-breakpoint
CREATE INDEX `bankaccount_kiln_idx` ON `bank_accounts` (`kilnId`);--> statement-breakpoint
CREATE INDEX `banktxn_kiln_account_idx` ON `bank_transactions` (`kilnId`,`bankAccountId`);--> statement-breakpoint
CREATE INDEX `banktxn_kiln_reconciled_idx` ON `bank_transactions` (`kilnId`,`reconciled`);