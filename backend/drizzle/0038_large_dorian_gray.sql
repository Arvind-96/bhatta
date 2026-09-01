CREATE TABLE `doctor_visits` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`seasonId` varchar(64),
	`doctorId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`ailment` text,
	`medicineCost` double NOT NULL DEFAULT 0,
	`consultationFee` double NOT NULL DEFAULT 0,
	`paymentMode` varchar(20),
	`cashAmount` double,
	`onlineAmount` double,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `doctor_visits__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `doctors` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(255),
	`qualification` varchar(255),
	`clinicAddress` text,
	`notes` text,
	`active` boolean NOT NULL DEFAULT true,
	`createdAt` datetime,
	CONSTRAINT `doctors__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `doctorVisitId` varchar(64);--> statement-breakpoint
CREATE INDEX `doctorvisit_kiln_date_idx` ON `doctor_visits` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `doctorvisit_kiln_person_idx` ON `doctor_visits` (`kilnId`,`personId`);--> statement-breakpoint
CREATE INDEX `doctorvisit_kiln_doctor_idx` ON `doctor_visits` (`kilnId`,`doctorId`);--> statement-breakpoint
CREATE INDEX `doctor_kiln_idx` ON `doctors` (`kilnId`);