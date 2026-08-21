ALTER TABLE `kilns` ADD `stateCode` varchar(255);--> statement-breakpoint
ALTER TABLE `kilns` ADD `bankAccountNumber` varchar(255);--> statement-breakpoint
ALTER TABLE `kilns` ADD `bankName` varchar(255);--> statement-breakpoint
ALTER TABLE `kilns` ADD `bankIfscCode` varchar(255);--> statement-breakpoint
ALTER TABLE `kilns` ADD `signaturePath` varchar(512);--> statement-breakpoint
ALTER TABLE `kilns` ADD `defaultTermsAndConditions` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `customerStateCode` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `vehicleNumber` varchar(255);--> statement-breakpoint
ALTER TABLE `invoices` ADD `gstRatePercent` double;--> statement-breakpoint
ALTER TABLE `invoices` ADD `gstType` varchar(20);--> statement-breakpoint
ALTER TABLE `invoices` ADD `session` varchar(20);--> statement-breakpoint
ALTER TABLE `invoices` ADD `sessionSerialNumber` int;--> statement-breakpoint
ALTER TABLE `invoices` ADD `termsAndConditions` text;