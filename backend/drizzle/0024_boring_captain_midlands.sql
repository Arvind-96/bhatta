ALTER TABLE `expenses` MODIFY COLUMN `paymentMode` varchar(20);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `tipPaymentMode` varchar(20);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `tipCashAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `tipOnlineAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingPaymentMode` varchar(20);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingCashAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `loadingOnlineAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingPaymentMode` varchar(20);--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingCashAmount` double;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `unloadingOnlineAmount` double;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `driverTipPaymentMode` varchar(20);--> statement-breakpoint
ALTER TABLE `dispatches` ADD `driverTipCashAmount` double;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `driverTipOnlineAmount` double;--> statement-breakpoint
ALTER TABLE `expenses` ADD `cashAmount` double;--> statement-breakpoint
ALTER TABLE `expenses` ADD `onlineAmount` double;