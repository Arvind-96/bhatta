CREATE TABLE `kiln_memberships` (
	`_id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`kilnId` text NOT NULL,
	`role` text NOT NULL,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `membership_user_kiln_unique` ON `kiln_memberships` (`userId`,`kilnId`);--> statement-breakpoint
CREATE TABLE `kilns` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`location` text,
	`phone` text,
	`onboardedAt` integer,
	`latitude` real,
	`longitude` real,
	`radiusMeters` integer DEFAULT 200,
	`yardCapacityBricks` integer,
	`createdAt` integer
);
--> statement-breakpoint
CREATE TABLE `sync_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`action` text NOT NULL,
	`status` text DEFAULT 'APPLIED',
	`createdAt` integer
);
--> statement-breakpoint
CREATE TABLE `users` (
	`_id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`passwordHash` text NOT NULL,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `attendances` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`date` integer NOT NULL,
	`status` text NOT NULL,
	`wageAmount` real,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_person_date_unique` ON `attendances` (`personId`,`date`);--> statement-breakpoint
CREATE TABLE `family_members` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`headPersonId` text NOT NULL,
	`name` text NOT NULL,
	`relation` text NOT NULL,
	`age` integer,
	`sex` text,
	`isWorking` integer DEFAULT false,
	`workerId` text,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `family_kiln_head_idx` ON `family_members` (`kilnId`,`headPersonId`);--> statement-breakpoint
CREATE TABLE `ledger_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`direction` text NOT NULL,
	`amount` real NOT NULL,
	`reason` text NOT NULL,
	`category` text,
	`paymentMode` text,
	`contractId` text,
	`date` integer,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `ledger_kiln_person_date_idx` ON `ledger_entries` (`kilnId`,`personId`,`date`);--> statement-breakpoint
CREATE TABLE `payment_receipts` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`receiptNumber` text NOT NULL,
	`amountPaid` real NOT NULL,
	`totalAgreedAmount` real,
	`balanceBefore` real NOT NULL,
	`balanceAfter` real NOT NULL,
	`paymentMode` text,
	`notes` text,
	`date` integer,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `receipt_number_unique` ON `payment_receipts` (`receiptNumber`);--> statement-breakpoint
CREATE INDEX `receipt_kiln_date_idx` ON `payment_receipts` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `people` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`phone` text,
	`address` text,
	`notes` text,
	`status` text DEFAULT 'ACTIVE',
	`idNumber` text,
	`age` integer,
	`sex` text,
	`workType` text,
	`dailyWage` real,
	`ratePerThousand` real,
	`contractorId` text,
	`familyHeadId` text,
	`payType` text,
	`commissionPerThousand` real,
	`defaultRatePerThousand` real,
	`bharaiRatePerThousand` real,
	`monthlySalary` real,
	`stackingStage` text,
	`bharaiContractorId` text,
	`nikasiContractorId` text,
	`faceDescriptor` text,
	`firingShiftAnchorDate` integer,
	`firingShiftAnchorType` text,
	`vehicleNumber` text,
	`licenseNumber` text,
	`ratePerTrolley` real,
	`designation` text,
	`isOfficeStaff` integer DEFAULT false,
	`gstNumber` text,
	`contractRate` real,
	`contractUnit` text,
	`profitSharePercent` real,
	`khetArea` real,
	`khetAreaUnit` text DEFAULT 'bigha',
	`khetLocation` text,
	`agreedDepthFeet` real,
	`creditLimit` real,
	`active` integer DEFAULT true,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `people_kiln_type_idx` ON `people` (`kilnId`,`type`);--> statement-breakpoint
CREATE TABLE `work_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`workType` text NOT NULL,
	`quantity` real NOT NULL,
	`ratePerThousand` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `workentry_kiln_date_idx` ON `work_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `brick_categories` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`category` text NOT NULL,
	`quantity` integer DEFAULT 0,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `brickcat_kiln_category_unique` ON `brick_categories` (`kilnId`,`category`);--> statement-breakpoint
CREATE TABLE `brick_loading_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`vehicleType` text NOT NULL,
	`vehicleNumber` text NOT NULL,
	`driverId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`tipAmount` real DEFAULT 0,
	`dispatchId` text,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `brickloading_kiln_date_idx` ON `brick_loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `brick_production_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`categoryId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `brickprod_kiln_date_idx` ON `brick_production_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `chamber_gradings` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text NOT NULL,
	`a1Count` integer DEFAULT 0 NOT NULL,
	`jhamaCount` integer DEFAULT 0 NOT NULL,
	`pelaCount` integer DEFAULT 0 NOT NULL,
	`rodaCount` integer DEFAULT 0 NOT NULL,
	`stackedCount` integer,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `grading_kiln_date_idx` ON `chamber_gradings` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `fire_movement_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text NOT NULL,
	`gherNumber` integer NOT NULL,
	`startedAt` integer
);
--> statement-breakpoint
CREATE INDEX `firemove_kiln_started_idx` ON `fire_movement_logs` (`kilnId`,`startedAt`);--> statement-breakpoint
CREATE TABLE `firing_shifts` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`fitterId` text NOT NULL,
	`gherId` text,
	`shiftType` text NOT NULL,
	`handoverNotes` text,
	`overtimeHours` real DEFAULT 0,
	`overtimeRate` real,
	`bonusAmount` real DEFAULT 0,
	`date` integer,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `firingshift_kiln_date_idx` ON `firing_shifts` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `ghers` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`number` integer NOT NULL,
	`status` text DEFAULT 'EMPTY',
	`cycleStartedAt` integer,
	`updatedAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gher_kiln_number_unique` ON `ghers` (`kilnId`,`number`);--> statement-breakpoint
CREATE TABLE `kiln_incidents` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text,
	`type` text NOT NULL,
	`description` text NOT NULL,
	`repairCost` real DEFAULT 0,
	`bricksLost` integer DEFAULT 0,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `incident_kiln_date_idx` ON `kiln_incidents` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `loading_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`dispatchId` text,
	`palledarId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`ratePerThousand` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `loadingentry_kiln_date_idx` ON `loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `molding_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`workerId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`ratePerThousand` real NOT NULL,
	`damagedCount` integer DEFAULT 0,
	`date` integer,
	`washedOut` integer DEFAULT false,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `molding_kiln_date_idx` ON `molding_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `nikasi_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text NOT NULL,
	`gangId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`damagedCount` integer DEFAULT 0,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `nikasi_kiln_date_idx` ON `nikasi_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `production_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`batchNumber` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`qualityGrade` text DEFAULT 'A',
	`producedOn` integer,
	`thekedarId` text,
	`localId` text,
	`version` integer DEFAULT 1,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `productionlog_localid_unique` ON `production_logs` (`localId`);--> statement-breakpoint
CREATE INDEX `productionlog_kiln_produced_idx` ON `production_logs` (`kilnId`,`producedOn`);--> statement-breakpoint
CREATE TABLE `stacking_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text NOT NULL,
	`gangId` text NOT NULL,
	`stage` text,
	`bricksCount` integer NOT NULL,
	`damageCount` integer DEFAULT 0,
	`ratePerThousand` real,
	`qualityRating` text DEFAULT 'GOOD',
	`mode` text,
	`tractorNumber` text,
	`buggiCount` integer,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `stacking_kiln_date_idx` ON `stacking_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `stacking_vehicles` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`contractorId` text NOT NULL,
	`vehicleType` text NOT NULL,
	`vehicleNumber` text,
	`buggiCount` integer,
	`driverName` text,
	`status` text DEFAULT 'ACTIVE',
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `stackveh_kiln_contractor_idx` ON `stacking_vehicles` (`kilnId`,`contractorId`);--> statement-breakpoint
CREATE TABLE `wastage_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`type` text NOT NULL,
	`cause` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text DEFAULT 'trolley',
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `wastage_kiln_date_idx` ON `wastage_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `compliance_documents` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`documentType` text NOT NULL,
	`title` text NOT NULL,
	`issueDate` integer,
	`expiryDate` integer NOT NULL,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `compliance_kiln_expiry_idx` ON `compliance_documents` (`kilnId`,`expiryDate`);--> statement-breakpoint
CREATE TABLE `dispatches` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`customerName` text NOT NULL,
	`customerId` text,
	`grade` text DEFAULT 'A1',
	`bricksCount` integer NOT NULL,
	`amount` real NOT NULL,
	`driverId` text,
	`slipNumber` text NOT NULL,
	`invoiceNumber` text,
	`transportCost` real,
	`transportPaidBy` text,
	`breakageCount` integer DEFAULT 0,
	`returnedCount` integer DEFAULT 0,
	`returnReason` text,
	`paymentMode` text,
	`dispatchedOn` integer,
	`localId` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_slip_unique` ON `dispatches` (`slipNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_invoice_unique` ON `dispatches` (`invoiceNumber`);--> statement-breakpoint
CREATE UNIQUE INDEX `dispatch_localid_unique` ON `dispatches` (`localId`);--> statement-breakpoint
CREATE INDEX `dispatch_kiln_dispatched_idx` ON `dispatches` (`kilnId`,`dispatchedOn`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`category` text NOT NULL,
	`amount` real NOT NULL,
	`hours` real,
	`date` integer,
	`notes` text,
	`soilTripId` text,
	`incidentId` text,
	`dispatchId` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `expense_kiln_date_idx` ON `expenses` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `expense_kiln_category_idx` ON `expenses` (`kilnId`,`category`);--> statement-breakpoint
CREATE TABLE `stock_audits` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`itemName` text NOT NULL,
	`registerCount` real NOT NULL,
	`physicalCount` real NOT NULL,
	`variance` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `stockaudit_kiln_date_idx` ON `stock_audits` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `stock_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`type` text NOT NULL,
	`itemName` text NOT NULL,
	`quantity` real NOT NULL,
	`unit` text DEFAULT 'units',
	`recordedOn` integer,
	`localId` text,
	`version` integer DEFAULT 1,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `stockentry_localid_unique` ON `stock_entries` (`localId`);--> statement-breakpoint
CREATE INDEX `stockentry_kiln_type_idx` ON `stock_entries` (`kilnId`,`type`);--> statement-breakpoint
CREATE TABLE `stock_loading_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`categoryId` text NOT NULL,
	`bricksCount` integer NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `stockloading_kiln_date_idx` ON `stock_loading_entries` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `jcb_work_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`landId` text NOT NULL,
	`landownerId` text NOT NULL,
	`machineId` text,
	`driverId` text NOT NULL,
	`contractId` text,
	`hoursWorked` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `jcbwork_kiln_date_idx` ON `jcb_work_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE INDEX `jcbwork_kiln_land_idx` ON `jcb_work_logs` (`kilnId`,`landId`);--> statement-breakpoint
CREATE TABLE `lands` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`landownerId` text NOT NULL,
	`name` text NOT NULL,
	`village` text,
	`tehsil` text,
	`district` text,
	`state` text,
	`khasraNumber` text,
	`khataNumber` text,
	`latitude` real,
	`longitude` real,
	`area` real,
	`areaUnit` text DEFAULT 'bigha',
	`soilType` text,
	`estimatedSoilQuantity` real,
	`status` text DEFAULT 'AVAILABLE',
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `land_kiln_owner_idx` ON `lands` (`kilnId`,`landownerId`);--> statement-breakpoint
CREATE TABLE `soil_arrivals` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`landownerId` text NOT NULL,
	`contractId` text,
	`jcbUsed` integer DEFAULT false,
	`tractorUsed` integer DEFAULT false,
	`jcbDriverId` text,
	`tractorDriverId` text,
	`trolleyCount` integer NOT NULL,
	`depthFeet` real,
	`paymentGiven` real DEFAULT 0,
	`paymentPending` real DEFAULT 0,
	`soilRemaining` real,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `soilarrival_kiln_date_idx` ON `soil_arrivals` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `soil_contracts` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`contractNumber` text NOT NULL,
	`landId` text NOT NULL,
	`landownerId` text NOT NULL,
	`soilType` text,
	`rateType` text DEFAULT 'PER_TROLLEY',
	`contractedQuantity` real,
	`ratePerTrolley` real,
	`contractedAreaBigha` real,
	`ratePerBigha` real,
	`contractedDepth` real,
	`depthUnit` text DEFAULT 'feet',
	`ratePerDepthUnit` real,
	`totalContractValue` real NOT NULL,
	`advanceAmount` real DEFAULT 0,
	`startDate` integer,
	`endDate` integer,
	`agreedDepthFeet` real,
	`paymentTerms` text,
	`status` text DEFAULT 'ACTIVE',
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contract_kiln_number_unique` ON `soil_contracts` (`kilnId`,`contractNumber`);--> statement-breakpoint
CREATE INDEX `contract_kiln_land_idx` ON `soil_contracts` (`kilnId`,`landId`);--> statement-breakpoint
CREATE INDEX `contract_kiln_owner_idx` ON `soil_contracts` (`kilnId`,`landownerId`);--> statement-breakpoint
CREATE TABLE `soil_trips` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`landownerId` text NOT NULL,
	`driverId` text,
	`contractId` text,
	`landId` text,
	`tractorNumber` text,
	`trolleyCount` integer DEFAULT 1,
	`receivedTrolleyCount` integer,
	`ratePerTrolley` real NOT NULL,
	`driverRatePerTrolley` real,
	`depthFeet` real,
	`status` text DEFAULT 'ARRIVED',
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `soiltrip_kiln_date_idx` ON `soil_trips` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `fuel_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`gherId` text NOT NULL,
	`fuelType` text NOT NULL,
	`quantityKg` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `fuellog_kiln_date_idx` ON `fuel_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `fuel_purchases` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`fuelType` text NOT NULL,
	`supplierId` text,
	`vehicleNumber` text,
	`invoicedWeightKg` real NOT NULL,
	`actualWeightKg` real NOT NULL,
	`amount` real NOT NULL,
	`paidAmount` real DEFAULT 0,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `fuelpurchase_kiln_date_idx` ON `fuel_purchases` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `fuel_types` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`name` text NOT NULL,
	`createdAt` integer
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fueltype_kiln_name_unique` ON `fuel_types` (`kilnId`,`name`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real DEFAULT 0 NOT NULL,
	`unit` text DEFAULT 'pcs',
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `inventoryitem_kiln_name_idx` ON `inventory_items` (`kilnId`,`name`);--> statement-breakpoint
CREATE TABLE `kiln_vehicles` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `kilnvehicle_kiln_name_idx` ON `kiln_vehicles` (`kilnId`,`name`);--> statement-breakpoint
CREATE TABLE `machine_fuel_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`machineId` text NOT NULL,
	`fuelType` text NOT NULL,
	`quantity` real NOT NULL,
	`hoursRun` real,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `machinefuel_kiln_date_idx` ON `machine_fuel_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `machine_maintenance_logs` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`machineId` text NOT NULL,
	`description` text NOT NULL,
	`cost` real DEFAULT 0,
	`downtimeHours` real DEFAULT 0,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `machinemaint_kiln_date_idx` ON `machine_maintenance_logs` (`kilnId`,`date`);--> statement-breakpoint
CREATE TABLE `machines` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`identifier` text,
	`active` integer DEFAULT true,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `machine_kiln_type_idx` ON `machines` (`kilnId`,`type`);--> statement-breakpoint
CREATE TABLE `supplied_items` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`personId` text NOT NULL,
	`itemId` text NOT NULL,
	`quantity` real NOT NULL,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `supplieditem_kiln_person_idx` ON `supplied_items` (`kilnId`,`personId`);--> statement-breakpoint
CREATE TABLE `vehicle_diesel_entries` (
	`_id` text PRIMARY KEY NOT NULL,
	`kilnId` text NOT NULL,
	`vehicleId` text NOT NULL,
	`quantityLiters` real NOT NULL,
	`costAmount` real,
	`date` integer,
	`notes` text,
	`createdAt` integer
);
--> statement-breakpoint
CREATE INDEX `vehicledieselentry_kiln_date_idx` ON `vehicle_diesel_entries` (`kilnId`,`date`);