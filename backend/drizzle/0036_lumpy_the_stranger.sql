ALTER TABLE `soil_arrivals` ADD `siteId` varchar(64);--> statement-breakpoint
CREATE INDEX `soilarrival_kiln_site_idx` ON `soil_arrivals` (`kilnId`,`siteId`);