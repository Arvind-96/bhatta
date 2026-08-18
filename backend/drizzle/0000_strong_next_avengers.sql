CREATE TABLE `kiln_memberships` (
	`_id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`role` varchar(50) NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `kiln_memberships__id` PRIMARY KEY(`_id`),
	CONSTRAINT `membership_user_kiln_unique` UNIQUE(`userId`,`kilnId`)
);
--> statement-breakpoint
CREATE TABLE `kilns` (
	`_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`location` varchar(255),
	`phone` varchar(255),
	`onboardedAt` datetime,
	`latitude` double,
	`longitude` double,
	`radiusMeters` int DEFAULT 200,
	`yardCapacityBricks` int,
	`seasonStartMonth` int DEFAULT 8,
	`seasonStartDay` int DEFAULT 1,
	`dayShiftStart` varchar(255) DEFAULT '08:00',
	`dayShiftEnd` varchar(255) DEFAULT '18:00',
	`gstNumber` varchar(255),
	`createdAt` datetime,
	CONSTRAINT `kilns__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`entityType` varchar(255) NOT NULL,
	`entityId` varchar(64) NOT NULL,
	`action` varchar(255) NOT NULL,
	`status` varchar(50) DEFAULT 'APPLIED',
	`createdAt` datetime,
	CONSTRAINT `sync_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `users` (
	`_id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`email` varchar(255) NOT NULL,
	`passwordHash` varchar(255) NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `users__id` PRIMARY KEY(`_id`),
	CONSTRAINT `users_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `attendances` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`date` datetime NOT NULL,
	`status` varchar(50) NOT NULL,
	`wageAmount` double,
	`createdAt` datetime,
	CONSTRAINT `attendances__id` PRIMARY KEY(`_id`),
	CONSTRAINT `attendance_person_date_unique` UNIQUE(`personId`,`date`)
);
--> statement-breakpoint
CREATE TABLE `family_members` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`headPersonId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`relation` varchar(50) NOT NULL,
	`age` int,
	`sex` varchar(50),
	`isWorking` boolean DEFAULT false,
	`workerId` varchar(64),
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `family_members__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`direction` varchar(50) NOT NULL,
	`amount` double NOT NULL,
	`reason` text NOT NULL,
	`category` varchar(50),
	`paymentMode` varchar(50),
	`cashAmount` double,
	`onlineAmount` double,
	`contractId` varchar(64),
	`date` datetime,
	`createdAt` datetime,
	CONSTRAINT `ledger_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`receiptNumber` varchar(255) NOT NULL,
	`amountPaid` double NOT NULL,
	`totalAgreedAmount` double,
	`balanceBefore` double NOT NULL,
	`balanceAfter` double NOT NULL,
	`paymentMode` varchar(50),
	`cashAmount` double,
	`onlineAmount` double,
	`notes` text,
	`date` datetime,
	`createdAt` datetime,
	CONSTRAINT `payment_receipts__id` PRIMARY KEY(`_id`),
	CONSTRAINT `receipt_number_unique` UNIQUE(`receiptNumber`)
);
--> statement-breakpoint
CREATE TABLE `people` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`type` varchar(50) NOT NULL,
	`name` varchar(255) NOT NULL,
	`phone` varchar(255),
	`address` varchar(255),
	`notes` text,
	`status` varchar(50) DEFAULT 'ACTIVE',
	`idNumber` varchar(255),
	`age` int,
	`sex` varchar(50),
	`workType` varchar(50),
	`dailyWage` double,
	`ratePerThousand` double,
	`contractorId` varchar(64),
	`familyHeadId` varchar(64),
	`payType` varchar(50),
	`commissionPerThousand` double,
	`defaultRatePerThousand` double,
	`bharaiRatePerThousand` double,
	`monthlySalary` double,
	`stackingStage` varchar(50),
	`bharaiContractorId` varchar(64),
	`nikasiContractorId` varchar(64),
	`firingShiftAnchorDate` datetime,
	`firingShiftAnchorType` varchar(50),
	`vehicleNumber` varchar(255),
	`licenseNumber` varchar(255),
	`ratePerTrolley` double,
	`designation` varchar(255),
	`isOfficeStaff` boolean DEFAULT false,
	`gstNumber` varchar(255),
	`contractRate` double,
	`contractUnit` varchar(255),
	`profitSharePercent` double,
	`khetArea` double,
	`khetAreaUnit` varchar(50) DEFAULT 'bigha',
	`khetLocation` varchar(255),
	`agreedDepthFeet` double,
	`creditLimit` double,
	`active` boolean DEFAULT true,
	`createdAt` datetime,
	CONSTRAINT `people__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `work_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`workType` varchar(50) NOT NULL,
	`quantity` double NOT NULL,
	`ratePerThousand` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `work_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `brick_categories` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`category` varchar(255) NOT NULL,
	`grade` varchar(255),
	`quantity` int DEFAULT 0,
	`pricePerBrick` double DEFAULT 0,
	`createdAt` datetime,
	CONSTRAINT `brick_categories__id` PRIMARY KEY(`_id`),
	CONSTRAINT `brickcat_kiln_category_unique` UNIQUE(`kilnId`,`category`)
);
--> statement-breakpoint
CREATE TABLE `brick_loading_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`vehicleType` varchar(50) NOT NULL,
	`vehicleNumber` varchar(255) NOT NULL,
	`driverId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`tipAmount` double DEFAULT 0,
	`loadingCharge` double,
	`categoryId` varchar(64),
	`dispatchId` varchar(64),
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `brick_loading_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `brick_production_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `brick_production_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `chamber_gradings` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64) NOT NULL,
	`a1Count` int NOT NULL DEFAULT 0,
	`jhamaCount` int NOT NULL DEFAULT 0,
	`pelaCount` int NOT NULL DEFAULT 0,
	`rodaCount` int NOT NULL DEFAULT 0,
	`stackedCount` int,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `chamber_gradings__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `fire_movement_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64) NOT NULL,
	`gherNumber` int NOT NULL,
	`startedAt` datetime,
	CONSTRAINT `fire_movement_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `firing_shifts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`fitterId` varchar(64) NOT NULL,
	`gherId` varchar(64),
	`shiftType` varchar(50) NOT NULL,
	`handoverNotes` text,
	`overtimeHours` double DEFAULT 0,
	`overtimeRate` double,
	`bonusAmount` double DEFAULT 0,
	`date` datetime,
	`createdAt` datetime,
	CONSTRAINT `firing_shifts__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `ghers` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`number` int NOT NULL,
	`status` varchar(50) DEFAULT 'EMPTY',
	`cycleStartedAt` datetime,
	`updatedAt` datetime,
	CONSTRAINT `ghers__id` PRIMARY KEY(`_id`),
	CONSTRAINT `gher_kiln_number_unique` UNIQUE(`kilnId`,`number`)
);
--> statement-breakpoint
CREATE TABLE `kiln_incidents` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64),
	`type` varchar(50) NOT NULL,
	`description` text NOT NULL,
	`repairCost` double DEFAULT 0,
	`bricksLost` int DEFAULT 0,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `kiln_incidents__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `loading_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`dispatchId` varchar(64),
	`palledarId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`ratePerThousand` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `loading_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `molding_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`workerId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`ratePerThousand` double NOT NULL,
	`damagedCount` int DEFAULT 0,
	`date` datetime,
	`washedOut` boolean DEFAULT false,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `molding_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `nikasi_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64) NOT NULL,
	`gangId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`damagedCount` int DEFAULT 0,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `nikasi_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `production_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`batchNumber` varchar(255) NOT NULL,
	`bricksCount` int NOT NULL,
	`qualityGrade` varchar(50) DEFAULT 'A',
	`producedOn` datetime,
	`thekedarId` varchar(64),
	`localId` varchar(64),
	`version` int DEFAULT 1,
	`createdAt` datetime,
	CONSTRAINT `production_logs__id` PRIMARY KEY(`_id`),
	CONSTRAINT `productionlog_localid_unique` UNIQUE(`localId`)
);
--> statement-breakpoint
CREATE TABLE `stacking_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64) NOT NULL,
	`gangId` varchar(64) NOT NULL,
	`stage` varchar(50),
	`bricksCount` int NOT NULL,
	`damageCount` int DEFAULT 0,
	`ratePerThousand` double,
	`qualityRating` varchar(50) DEFAULT 'GOOD',
	`mode` varchar(50),
	`tractorNumber` varchar(255),
	`buggiCount` int,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `stacking_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `stacking_vehicles` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`contractorId` varchar(64) NOT NULL,
	`vehicleType` varchar(50) NOT NULL,
	`vehicleNumber` varchar(255),
	`buggiCount` int,
	`driverName` varchar(255),
	`status` varchar(50) DEFAULT 'ACTIVE',
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `stacking_vehicles__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `wastage_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`type` varchar(50) NOT NULL,
	`cause` varchar(50) NOT NULL,
	`quantity` double NOT NULL,
	`unit` varchar(50) DEFAULT 'trolley',
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `wastage_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `compliance_documents` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`documentType` varchar(50) NOT NULL,
	`title` varchar(255) NOT NULL,
	`issueDate` datetime,
	`expiryDate` datetime NOT NULL,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `compliance_documents__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `dispatches` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`customerName` varchar(255) NOT NULL,
	`customerId` varchar(64),
	`grade` varchar(50) DEFAULT 'A1',
	`bricksCount` int NOT NULL,
	`amount` double NOT NULL,
	`driverId` varchar(64),
	`slipNumber` varchar(255) NOT NULL,
	`invoiceNumber` varchar(255),
	`transportCost` double,
	`transportPaidBy` varchar(50),
	`breakageCount` int DEFAULT 0,
	`returnedCount` int DEFAULT 0,
	`returnReason` text,
	`paymentMode` varchar(50),
	`cashAmount` double,
	`onlineAmount` double,
	`categoryId` varchar(64),
	`vehicleNumber` varchar(255),
	`vehicleType` varchar(255),
	`driverTipAmount` double,
	`discountAmount` double,
	`dispatchedOn` datetime,
	`localId` varchar(64),
	`createdAt` datetime,
	CONSTRAINT `dispatches__id` PRIMARY KEY(`_id`),
	CONSTRAINT `dispatch_slip_unique` UNIQUE(`kilnId`,`slipNumber`),
	CONSTRAINT `dispatch_invoice_unique` UNIQUE(`kilnId`,`invoiceNumber`),
	CONSTRAINT `dispatch_localid_unique` UNIQUE(`localId`)
);
--> statement-breakpoint
CREATE TABLE `expenses` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`category` varchar(50) NOT NULL,
	`amount` double NOT NULL,
	`paymentMode` varchar(50),
	`hours` double,
	`date` datetime,
	`notes` text,
	`soilTripId` varchar(64),
	`incidentId` varchar(64),
	`dispatchId` varchar(64),
	`createdAt` datetime,
	CONSTRAINT `expenses__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `stock_audits` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`registerCount` double NOT NULL,
	`physicalCount` double NOT NULL,
	`variance` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `stock_audits__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `stock_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`type` varchar(50) NOT NULL,
	`itemName` varchar(255) NOT NULL,
	`quantity` double NOT NULL,
	`unit` varchar(50) DEFAULT 'units',
	`recordedOn` datetime,
	`localId` varchar(64),
	`version` int DEFAULT 1,
	`createdAt` datetime,
	CONSTRAINT `stock_entries__id` PRIMARY KEY(`_id`),
	CONSTRAINT `stockentry_localid_unique` UNIQUE(`localId`)
);
--> statement-breakpoint
CREATE TABLE `stock_loading_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`categoryId` varchar(64) NOT NULL,
	`bricksCount` int NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `stock_loading_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `jcb_work_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`landId` varchar(64) NOT NULL,
	`landownerId` varchar(64) NOT NULL,
	`machineId` varchar(64),
	`driverId` varchar(64) NOT NULL,
	`contractId` varchar(64),
	`hoursWorked` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `jcb_work_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `lands` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`landownerId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`village` varchar(255),
	`tehsil` varchar(255),
	`district` varchar(255),
	`state` varchar(255),
	`khasraNumber` varchar(255),
	`khataNumber` varchar(255),
	`latitude` double,
	`longitude` double,
	`area` double,
	`areaUnit` varchar(50) DEFAULT 'bigha',
	`soilType` varchar(255),
	`estimatedSoilQuantity` double,
	`status` varchar(50) DEFAULT 'AVAILABLE',
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `lands__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `soil_arrivals` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`landownerId` varchar(64) NOT NULL,
	`contractId` varchar(64),
	`jcbUsed` boolean DEFAULT false,
	`tractorUsed` boolean DEFAULT false,
	`jcbDriverId` varchar(64),
	`tractorDriverId` varchar(64),
	`trolleyCount` int NOT NULL,
	`depthFeet` double,
	`paymentGiven` double DEFAULT 0,
	`paymentPending` double DEFAULT 0,
	`soilRemaining` double,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `soil_arrivals__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `soil_contracts` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`contractNumber` varchar(255) NOT NULL,
	`landId` varchar(64) NOT NULL,
	`landownerId` varchar(64) NOT NULL,
	`soilType` varchar(255),
	`rateType` varchar(50) DEFAULT 'PER_TROLLEY',
	`contractedQuantity` double,
	`ratePerTrolley` double,
	`contractedAreaBigha` double,
	`ratePerBigha` double,
	`contractedDepth` double,
	`depthUnit` varchar(50) DEFAULT 'feet',
	`ratePerDepthUnit` double,
	`totalContractValue` double NOT NULL,
	`advanceAmount` double DEFAULT 0,
	`startDate` datetime,
	`endDate` datetime,
	`agreedDepthFeet` double,
	`paymentTerms` text,
	`status` varchar(50) DEFAULT 'ACTIVE',
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `soil_contracts__id` PRIMARY KEY(`_id`),
	CONSTRAINT `contract_kiln_number_unique` UNIQUE(`kilnId`,`contractNumber`)
);
--> statement-breakpoint
CREATE TABLE `soil_trips` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`landownerId` varchar(64) NOT NULL,
	`driverId` varchar(64),
	`contractId` varchar(64),
	`landId` varchar(64),
	`tractorNumber` varchar(255),
	`trolleyCount` int DEFAULT 1,
	`receivedTrolleyCount` int,
	`ratePerTrolley` double NOT NULL,
	`driverRatePerTrolley` double,
	`depthFeet` double,
	`status` varchar(50) DEFAULT 'ARRIVED',
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `soil_trips__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`gherId` varchar(64) NOT NULL,
	`fuelType` varchar(255) NOT NULL,
	`quantityKg` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `fuel_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_purchases` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`fuelType` varchar(255) NOT NULL,
	`supplierId` varchar(64),
	`vehicleNumber` varchar(255),
	`invoicedWeightKg` double NOT NULL,
	`actualWeightKg` double NOT NULL,
	`amount` double NOT NULL,
	`paidAmount` double DEFAULT 0,
	`paymentMode` varchar(50),
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `fuel_purchases__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `fuel_types` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `fuel_types__id` PRIMARY KEY(`_id`),
	CONSTRAINT `fueltype_kiln_name_unique` UNIQUE(`kilnId`,`name`)
);
--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`quantity` double NOT NULL DEFAULT 0,
	`unit` varchar(50) DEFAULT 'pcs',
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `inventory_items__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `kiln_vehicles` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(255) NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `kiln_vehicles__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `machine_fuel_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`machineId` varchar(64) NOT NULL,
	`fuelType` varchar(50) NOT NULL,
	`quantity` double NOT NULL,
	`hoursRun` double,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `machine_fuel_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `machine_maintenance_logs` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`machineId` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`cost` double DEFAULT 0,
	`downtimeHours` double DEFAULT 0,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `machine_maintenance_logs__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`type` varchar(50) NOT NULL,
	`identifier` varchar(255),
	`active` boolean DEFAULT true,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `machines__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `supplied_items` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`itemId` varchar(64) NOT NULL,
	`quantity` double NOT NULL,
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `supplied_items__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `vehicle_diesel_entries` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`vehicleId` varchar(64) NOT NULL,
	`quantityLiters` double NOT NULL,
	`costAmount` double,
	`paymentMode` varchar(50),
	`date` datetime,
	`notes` text,
	`createdAt` datetime,
	CONSTRAINT `vehicle_diesel_entries__id` PRIMARY KEY(`_id`)
);
--> statement-breakpoint
CREATE TABLE `salary_slips` (
	`_id` varchar(64) NOT NULL,
	`kilnId` varchar(64) NOT NULL,
	`personId` varchar(64) NOT NULL,
	`month` varchar(20) NOT NULL,
	`daysPresent` double NOT NULL,
	`daysAbsent` double NOT NULL,
	`daysHalfDay` double NOT NULL,
	`daysLate` double NOT NULL,
	`grossSalary` double NOT NULL,
	`deductions` double NOT NULL,
	`netSalary` double NOT NULL,
	`pdfPathEn` varchar(512) NOT NULL,
	`pdfPathHi` varchar(512) NOT NULL,
	`createdAt` datetime,
	CONSTRAINT `salary_slips__id` PRIMARY KEY(`_id`),
	CONSTRAINT `salary_person_month_unique` UNIQUE(`personId`,`month`)
);
--> statement-breakpoint
CREATE INDEX `family_kiln_head_idx` ON `family_members` (`kilnId`,`headPersonId`);--> statement-breakpoint
CREATE INDEX `ledger_kiln_person_date_idx` ON `ledger_entries` (`kilnId`,`personId`,`date`);--> statement-breakpoint
CREATE INDEX `receipt_kiln_date_idx` ON `payment_receipts` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `people_kiln_type_idx` ON `people` (`kilnId`,`type`);--> statement-breakpoint
CREATE INDEX `workentry_kiln_date_idx` ON `work_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `brickloading_kiln_date_idx` ON `brick_loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `brickprod_kiln_date_idx` ON `brick_production_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `grading_kiln_date_idx` ON `chamber_gradings` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `firemove_kiln_started_idx` ON `fire_movement_logs` (`kilnId`,`startedAt`);--> statement-breakpoint
CREATE INDEX `firingshift_kiln_date_idx` ON `firing_shifts` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `incident_kiln_date_idx` ON `kiln_incidents` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `loadingentry_kiln_date_idx` ON `loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `molding_kiln_date_idx` ON `molding_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `nikasi_kiln_date_idx` ON `nikasi_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `productionlog_kiln_produced_idx` ON `production_logs` (`kilnId`,`producedOn`);--> statement-breakpoint
CREATE INDEX `stacking_kiln_date_idx` ON `stacking_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `stackveh_kiln_contractor_idx` ON `stacking_vehicles` (`kilnId`,`contractorId`);--> statement-breakpoint
CREATE INDEX `wastage_kiln_date_idx` ON `wastage_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `compliance_kiln_expiry_idx` ON `compliance_documents` (`kilnId`,`expiryDate`);--> statement-breakpoint
CREATE INDEX `dispatch_kiln_dispatched_idx` ON `dispatches` (`kilnId`,`dispatchedOn`);--> statement-breakpoint
CREATE INDEX `expense_kiln_date_idx` ON `expenses` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `expense_kiln_category_idx` ON `expenses` (`kilnId`,`category`);--> statement-breakpoint
CREATE INDEX `stockaudit_kiln_date_idx` ON `stock_audits` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `stockentry_kiln_type_idx` ON `stock_entries` (`kilnId`,`type`);--> statement-breakpoint
CREATE INDEX `stockloading_kiln_date_idx` ON `stock_loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `jcbwork_kiln_date_idx` ON `jcb_work_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `jcbwork_kiln_land_idx` ON `jcb_work_logs` (`kilnId`,`landId`);--> statement-breakpoint
CREATE INDEX `land_kiln_owner_idx` ON `lands` (`kilnId`,`landownerId`);--> statement-breakpoint
CREATE INDEX `soilarrival_kiln_date_idx` ON `soil_arrivals` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `contract_kiln_land_idx` ON `soil_contracts` (`kilnId`,`landId`);--> statement-breakpoint
CREATE INDEX `contract_kiln_owner_idx` ON `soil_contracts` (`kilnId`,`landownerId`);--> statement-breakpoint
CREATE INDEX `soiltrip_kiln_date_idx` ON `soil_trips` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `fuellog_kiln_date_idx` ON `fuel_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `fuelpurchase_kiln_date_idx` ON `fuel_purchases` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `inventoryitem_kiln_name_idx` ON `inventory_items` (`kilnId`,`name`);--> statement-breakpoint
CREATE INDEX `kilnvehicle_kiln_name_idx` ON `kiln_vehicles` (`kilnId`,`name`);--> statement-breakpoint
CREATE INDEX `machinefuel_kiln_date_idx` ON `machine_fuel_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `machinemaint_kiln_date_idx` ON `machine_maintenance_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `machine_kiln_type_idx` ON `machines` (`kilnId`,`type`);--> statement-breakpoint
CREATE INDEX `supplieditem_kiln_person_idx` ON `supplied_items` (`kilnId`,`personId`);--> statement-breakpoint
CREATE INDEX `vehicledieselentry_kiln_date_idx` ON `vehicle_diesel_entries` (`kilnId`,`date`);