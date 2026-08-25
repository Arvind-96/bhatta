CREATE TABLE `supplier_invoices` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`supplierId` varchar(64) NOT NULL,
	`sequenceNumber` int,
	`date` datetime,
	`itemsReceived` json DEFAULT ('[]'),
	`totalBillAmount` double NOT NULL,
	`amountPaid` double NOT NULL DEFAULT 0,
	`paymentMode` varchar(20),
	`cashAmount` double,
	`onlineAmount` double,
	`createdAt` datetime,
	CONSTRAINT `supplier_invoices__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `suppliers` ADD `dateAdded` datetime;--> statement-breakpoint
CREATE INDEX `supplier_invoice_kiln_idx` ON `supplier_invoices` (`kilnId`);--> statement-breakpoint
CREATE INDEX `supplier_invoice_supplier_idx` ON `supplier_invoices` (`supplierId`);