ALTER TABLE `brick_loading_entries` MODIFY COLUMN `driverId` varchar(64);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `tripNumber` varchar(64);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingCharge` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `discountAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `amount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD CONSTRAINT `brickloading_kiln_tripnumber_unique` UNIQUE(`kilnId`,`tripNumber`);