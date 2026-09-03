ALTER TABLE `brick_loading_entries` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `brick_loading_entries` ADD `cancelledAt` datetime;--> statement-breakpoint
ALTER TABLE `challans` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `challans` ADD `cancelledAt` datetime;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `dispatches` ADD `cancelledAt` datetime;--> statement-breakpoint
ALTER TABLE `gate_passes` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `gate_passes` ADD `cancelledAt` datetime;--> statement-breakpoint
ALTER TABLE `invoices` ADD `cancelled` boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `cancelledAt` datetime;