CREATE TABLE `suppliers` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(32),
	`address` varchar(500),
	`suppliesList` json DEFAULT ('[]'),
	`createdAt` datetime,
	CONSTRAINT `suppliers__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE INDEX `supplier_kiln_idx` ON `suppliers` (`kilnId`);