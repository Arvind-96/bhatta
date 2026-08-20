CREATE TABLE `challans` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`dispatchId` varchar(64) NOT NULL,
	`sequenceNumber` int NOT NULL,
	`vehicleNumber` varchar(255),
	`vehicleType` varchar(255),
	`driverName` varchar(255),
	`driverPhone` varchar(255),
	`customerName` varchar(255) NOT NULL,
	`customerAddress` varchar(255),
	`customerPhone` varchar(255),
	`categoryId` varchar(64),
	`bricksCount` int NOT NULL,
	`challanDate` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `challans__id` PRIMARY KEY(`_id`),
	CONSTRAINT `challan_kiln_sequence_unique` UNIQUE(`kilnId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `gate_passes` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`dispatchId` varchar(64) NOT NULL,
	`sequenceNumber` int NOT NULL,
	`vehicleNumber` varchar(255),
	`vehicleType` varchar(255),
	`driverName` varchar(255),
	`driverPhone` varchar(255),
	`customerName` varchar(255) NOT NULL,
	`categoryId` varchar(64),
	`bricksCount` int NOT NULL,
	`gatePassDate` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `gate_passes__id` PRIMARY KEY(`_id`),
	CONSTRAINT `gatepass_kiln_sequence_unique` UNIQUE(`kilnId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`dispatchId` varchar(64) NOT NULL,
	`sequenceNumber` int NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerAddress` varchar(255),
	`customerPhone` varchar(255),
	`customerGstNumber` varchar(255),
	`categoryId` varchar(64),
	`bricksCount` int NOT NULL,
	`ratePerBrick` double,
	`grossAmount` double,
	`discountAmount` double,
	`netAmount` double NOT NULL,
	`paymentMode` varchar(50),
	`cashAmount` double,
	`onlineAmount` double,
	`invoiceDate` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `invoices__id` PRIMARY KEY(`_id`),
	CONSTRAINT `invoice_kiln_sequence_unique` UNIQUE(`kilnId`,`sequenceNumber`)
);
--> statement-breakpoint
CREATE INDEX `challan_kiln_dispatch_idx` ON `challans` (`kilnId`,`dispatchId`);--> statement-breakpoint
CREATE INDEX `gatepass_kiln_dispatch_idx` ON `gate_passes` (`kilnId`,`dispatchId`);--> statement-breakpoint
CREATE INDEX `invoice_kiln_dispatch_idx` ON `invoices` (`kilnId`,`dispatchId`);