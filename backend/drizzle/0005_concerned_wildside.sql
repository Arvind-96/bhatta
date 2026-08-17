DROP INDEX `dispatch_invoice_unique`;--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_invoice_unique` ON `dispatches` (`kilnId`,`invoiceNumber`);