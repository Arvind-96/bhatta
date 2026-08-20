ALTER TABLE `brick_loading_entries` ADD `customerName` varchar(255);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `customerPhone` varchar(255);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `customerAddress` varchar(255);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `driverName` varchar(255);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `driverPhone` varchar(255);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadedBricksCount` int;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingLaborerCount` int;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingRatePerThousand` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingLaborerCount` int;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingRatePerThousand` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingDate` datetime;