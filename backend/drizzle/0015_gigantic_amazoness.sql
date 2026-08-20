ALTER TABLE `kiln_vehicles` ADD `initialMeterReading` double;--> statement-breakpoint
ALTER TABLE `kiln_vehicles` ADD `oilTankCapacity` double;--> statement-breakpoint
ALTER TABLE `kiln_vehicles` ADD `notes` text;--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `vehicleType` varchar(255);--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `initialMeterReading` double;--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `lastMeterReading` double;--> statement-breakpoint
ALTER TABLE `vehicle_diesel_entries` ADD `driverId` varchar(64);--> statement-breakpoint
CREATE INDEX `vehicledieselentry_kiln_driver_idx` ON `vehicle_diesel_entries` (`kilnId`,`driverId`);