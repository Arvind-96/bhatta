CREATE TABLE `salary_slips` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`month` text NOT NULL,
	`daysPresent` real NOT NULL,
	`daysAbsent` real NOT NULL,
	`daysHalfDay` real NOT NULL,
	`daysLate` real NOT NULL,
	`grossSalary` real NOT NULL,
	`deductions` real NOT NULL,
	`netSalary` real NOT NULL,
	`pdfPathEn` text NOT NULL,
	`pdfPathHi` text NOT NULL,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `salary_person_month_unique` ON `salary_slips` (`personId`,`month`);--> statement-breakpoint
ALTER TABLE `kilns` ADD `seasonStartMonth` integer DEFAULT 8;--> statement-breakpoint
ALTER TABLE `kilns` ADD `seasonStartDay` integer DEFAULT 1;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `cashAmount` real;--> statement-breakpoint
ALTER TABLE `ledger_entries` ADD `onlineAmount` real;--> statement-breakpoint
ALTER TABLE `payment_receipts` ADD `cashAmount` real;--> statement-breakpoint
ALTER TABLE `payment_receipts` ADD `onlineAmount` real;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `cashAmount` real;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `onlineAmount` real;--> statement-breakpoint
ALTER TABLE `expenses` ADD `paymentMode` text;--> statement-breakpoint
ALTER TABLE `fuel_purchases` ADD `paymentMode` text;--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `paymentMode` text;