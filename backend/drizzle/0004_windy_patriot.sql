DROP INDEX `dispatch_slip_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_slip_unique` ON `dispatches` (`kilnId`,`slipNumber`);