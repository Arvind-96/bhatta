ALTER TABLE `salary_slips` ADD `carriedForward` double DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `salary_slips` ADD `salaryLedgerEntryId` varchar(64);