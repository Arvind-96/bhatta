CREATE TABLE `seasons` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`startDate` datetime NOT NULL,
	`isCurrent` boolean NOT NULL DEFAULT false,
	`createdAt` datetime,
	CONSTRAINT `seasons__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `brick_loading_entries` DROP INDEX `brickloading_kiln_tripnumber_unique`;--> statement-breakpoint
ALTER TABLE `challans` DROP INDEX `challan_kiln_sequence_unique`;--> statement-breakpoint
ALTER TABLE `dispatches` DROP INDEX `dispatch_slip_unique`;--> statement-breakpoint
ALTER TABLE `dispatches` DROP INDEX `dispatch_invoice_unique`;--> statement-breakpoint
ALTER TABLE `gate_passes` DROP INDEX `gatepass_kiln_sequence_unique`;--> statement-breakpoint
ALTER TABLE `invoices` DROP INDEX `invoice_kiln_sequence_unique`;--> statement-breakpoint
ALTER TABLE `attendances` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `payment_receipts` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `work_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `brick_production_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `chamber_gradings` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `fire_movement_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `firing_shifts` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `kiln_incidents` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `loading_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `molding_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `nikasi_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `production_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `stacking_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `wastage_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `challans` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `dispatches` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `expenses` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `gate_passes` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `stock_audits` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `stock_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `stock_loading_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `jcb_work_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `soil_arrivals` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `soil_trips` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `sand_deliveries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `fuel_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `fuel_purchases` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `machine_fuel_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `machine_installment_payments` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `machine_maintenance_logs` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `supplied_items` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `salary_slips` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `supplier_invoices` ADD `seasonId` varchar(64);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD CONSTRAINT `brickloading_kiln_tripnumber_unique` UNIQUE(`kilnId`,`seasonId`,`tripNumber`);--> statement-breakpoint
ALTER TABLE `challans` ADD CONSTRAINT `challan_kiln_sequence_unique` UNIQUE(`kilnId`,`seasonId`,`sequenceNumber`);--> statement-breakpoint
ALTER TABLE `dispatches` ADD CONSTRAINT `dispatch_slip_unique` UNIQUE(`kilnId`,`seasonId`,`slipNumber`);--> statement-breakpoint
ALTER TABLE `dispatches` ADD CONSTRAINT `dispatch_invoice_unique` UNIQUE(`kilnId`,`seasonId`,`invoiceNumber`);--> statement-breakpoint
ALTER TABLE `gate_passes` ADD CONSTRAINT `gatepass_kiln_sequence_unique` UNIQUE(`kilnId`,`seasonId`,`sequenceNumber`);--> statement-breakpoint
ALTER TABLE `invoices` ADD CONSTRAINT `invoice_kiln_sequence_unique` UNIQUE(`kilnId`,`seasonId`,`sequenceNumber`);--> statement-breakpoint
CREATE INDEX `season_kiln_idx` ON `seasons` (`kilnId`);--> statement-breakpoint
ALTER TABLE `kilns` DROP COLUMN `seasonStartMonth`;--> statement-breakpoint
ALTER TABLE `kilns` DROP COLUMN `seasonStartDay`;