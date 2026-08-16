ALTER TABLE `kilns` ADD `dayShiftStart` text DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE `kilns` ADD `dayShiftEnd` text DEFAULT '18:00';--> statement-breakpoint
ALTER TABLE `brick_categories` ADD `pricePerBrick` real DEFAULT 0;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingCharge` real;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `categoryId` text;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `categoryId` text;--> statement-breakpoint
ALTER TABLE `people` DROP COLUMN `faceDescriptor`;