import "dotenv/config";
import { asc, count, eq } from "drizzle-orm";
import { db, runMigrations } from "../db/client";
import { kilns, people, ledgerEntries, seasons } from "../db/schema";
import { randomUUID } from "crypto";

import { createPerson } from "../services/person.service";
import { ensureGherCount, listGhers, updateGherStatus } from "../services/gher.service";
import { createMachine, createMachineFuelLog, createMaintenanceLog } from "../services/machine.service";
import { createSoilTrip } from "../services/soilTrip.service";
import { createMoldingEntry } from "../services/molding.service";
import { logWastage } from "../services/wastage.service";
import { createStackingEntry } from "../services/stacking.service";
import { createChamberGrading } from "../services/chamberGrading.service";
import { createBrickCategory } from "../services/brickCategory.service";
import { createFiringShift } from "../services/firingShift.service";
import { createFuelPurchase } from "../services/fuelPurchase.service";
import { createFuelLog } from "../services/fuelLog.service";
import { createProductionLog } from "../services/production.service";
import { createDispatch, recordDeliveryAdjustment } from "../services/dispatch.service";
import { createLoadingEntry } from "../services/loadingEntry.service";
import { createExpense } from "../services/expense.service";
import { createKilnIncident } from "../services/kilnIncident.service";
import { createComplianceDocument } from "../services/compliance.service";
import { createStockAudit } from "../services/stockAudit.service";
import { recordStockEntry } from "../services/stock.service";
import { markAttendance } from "../services/attendance.service";
import { addLedgerEntry } from "../services/ledger.service";

// ---------- small deterministic-ish RNG helpers ----------
function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randFloat(min: number, max: number) {
  return Math.random() * (max - min) + min;
}
function randChoice<T>(arr: readonly T[]): T {
  return arr[randInt(0, arr.length - 1)];
}
function randPhone() {
  return `${randChoice(["9", "8", "7"])}${randInt(100000000, 999999999)}`;
}
function dateAtOffset(daysAgo: number, hour = randInt(7, 19)) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, randInt(0, 59), 0, 0);
  return d;
}

const TOTAL_DAYS = 42; // 6-week rolling history

async function main() {
  runMigrations();

  const kiln = (await db.select().from(kilns).orderBy(asc(kilns.createdAt)))[0];
  if (!kiln) {
    console.error("No kiln found. Register an owner account through the app first (README Quick start), then re-run this script.");
    process.exit(1);
  }
  const kilnId = kiln._id as string;
  console.log(`Seeding test data into kiln "${kiln.name}" (${kilnId})`);

  let season = (await db.select().from(seasons).where(eq(seasons.kilnId, kilnId)))[0];
  if (!season) {
    const _id = randomUUID();
    await db.insert(seasons).values({ _id, kilnId, label: "Seed season", startDate: new Date(), isCurrent: true });
    season = (await db.select().from(seasons).where(eq(seasons._id, _id)))[0]!;
  }
  const seasonId = season._id;

  const existingPeople = (await db.select({ c: count() }).from(people).where(eq(people.kilnId, kilnId)))[0]!.c;
  if (existingPeople > 0) {
    console.log(`This kiln already has ${existingPeople} people on record — looks like it's already seeded. Skipping to avoid duplicates.`);
    process.exit(0);
  }

  if (!kiln.yardCapacityBricks || !kiln.latitude) {
    await db.update(kilns)
      .set({
        yardCapacityBricks: kiln.yardCapacityBricks ?? 400000,
        latitude: kiln.latitude ?? 29.0588,
        longitude: kiln.longitude ?? 76.0856,
        radiusMeters: kiln.radiusMeters ?? 250,
      })
      .where(eq(kilns._id, kilnId));
    console.log("Set default geofence + yard capacity on kiln.");
  }

  // ---------------- People ----------------
  console.log("Creating people...");

  const landowners = await Promise.all(
    ["Ram Singh", "Suresh Yadav", "Mahender Chaudhary", "Om Prakash Sharma"].map((name, i) =>
      createPerson({
        kilnId,
        type: "LANDOWNER",
        name,
        phone: randPhone(),
        address: `Village ${["Rampur", "Sonipat Khera", "Gohana Road", "Kharkhoda"][i]}`,
        khetArea: randInt(2, 8),
        khetAreaUnit: "bigha",
        khetLocation: `Khasra No. ${randInt(100, 999)}`,
        agreedDepthFeet: randInt(8, 14),
      })
    )
  );

  const drivers = await Promise.all(
    ["Sanjay Kumar", "Vinod Chauhan", "Deepak Rathi"].map((name) =>
      createPerson({
        kilnId,
        type: "DRIVER",
        name,
        phone: randPhone(),
        vehicleNumber: `HR-46-${randChoice(["A", "B", "C"])}-${randInt(1000, 9999)}`,
        licenseNumber: `HR${randInt(10, 99)}${randInt(100000000000, 999999999999)}`,
        ratePerTrolley: randInt(100, 150),
      })
    )
  );

  const suppliers = await Promise.all(
    ["Bharat Coal Traders", "Shiv Shakti Fuels", "Rajdhani Coal Co."].map((name) =>
      createPerson({
        kilnId,
        type: "SUPPLIER",
        name,
        phone: randPhone(),
        gstNumber: `06AAAAA${randInt(1000, 9999)}A1Z${randInt(1, 9)}`,
      })
    )
  );

  const thekedars = await Promise.all(
    ["Ramesh Thekedar", "Naresh Contractor"].map((name) =>
      createPerson({
        kilnId,
        type: "THEKEDAR",
        name,
        phone: randPhone(),
        contractRate: randInt(6000, 8000),
        contractUnit: "1000 bricks",
      })
    )
  );

  const partners = await Promise.all(
    ["Ashok Kumar", "Vijay Prasad"].map((name, i) =>
      createPerson({
        kilnId,
        type: "PARTNER",
        name,
        phone: randPhone(),
        profitSharePercent: [30, 20][i],
      })
    )
  );

  const contractors = await Promise.all(
    ["Mangal Sardar", "Chhotu Jamadaar", "Bhola Nath"].map((name) =>
      createPerson({
        kilnId,
        type: "LABOUR_CONTRACTOR",
        name,
        phone: randPhone(),
      })
    )
  );

  const workerNames = ["Ramu", "Shyam Lal", "Kallu", "Bantu", "Munna", "Chhotu Lal", "Rinku", "Sonu Kumar", "Pappu", "Guddu"];
  const workers = await Promise.all(
    workerNames.map((name, i) =>
      createPerson({
        kilnId,
        type: "WORKER",
        name,
        phone: randPhone(),
        idNumber: `${randInt(100000000000, 999999999999)}`,
        ratePerThousand: randInt(360, 430),
        contractorId: i % 3 === 0 ? contractors[i % contractors.length]._id : undefined,
      })
    )
  );

  const helperNames = ["Sita Devi", "Radha Bai", "Kamla Devi", "Ganga Devi", "Meena Kumari", "Sunita Devi", "Phoolwati", "Rukmani"];
  const helpers = await Promise.all(
    helperNames.map((name) =>
      createPerson({
        kilnId,
        type: "HELPER",
        name,
        phone: randPhone(),
        idNumber: `${randInt(100000000000, 999999999999)}`,
        dailyWage: randInt(350, 450),
      })
    )
  );

  const fitters = await Promise.all(
    ["Ustad Karim", "Ram Bharose", "Ustad Nazir", "Balram Fitter"].map((name) =>
      createPerson({
        kilnId,
        type: "FITTER",
        name,
        phone: randPhone(),
      })
    )
  );

  const customers = await Promise.all(
    ["Gupta Construction Co.", "Sharma Builders", "Metro Infra Pvt Ltd", "Verma & Sons", "City Developers", "Highway Contractors Ltd"].map(
      (name) =>
        createPerson({
          kilnId,
          type: "CUSTOMER",
          name,
          phone: randPhone(),
          address: "Delhi NCR",
          creditLimit: randInt(200000, 800000),
        })
    )
  );

  // One worker doubles as a palledar (loading gang) alongside labour contractors
  const palledars = [contractors[0], workers[1], workers[4]];

  console.log(
    `People created: ${landowners.length} landowners, ${drivers.length} drivers, ${suppliers.length} suppliers, ${thekedars.length} thekedars, ${partners.length} partners, ${contractors.length} contractors, ${workers.length} workers, ${helpers.length} helpers, ${fitters.length} fitters, ${customers.length} customers`
  );

  // ---------------- Chambers ----------------
  console.log("Setting up chambers...");
  await ensureGherCount(kilnId, 20);
  const ghers = await listGhers(kilnId);

  // ---------------- Brick categories ----------------
  console.log("Setting up brick categories...");
  const brickCategoryDefs = [
    { category: "A-1 Grade", grade: "A1", pricePerBrick: 7.5 },
    { category: "Jhama", grade: "Jhama", pricePerBrick: 5 },
    { category: "Pela/Seem", grade: "Pela", pricePerBrick: 4 },
    { category: "Roda", grade: "Roda", pricePerBrick: 2.5 },
  ];
  const brickCategories: Record<string, string> = {};
  for (const def of brickCategoryDefs) {
    const created = await createBrickCategory(kilnId, def.category, def.pricePerBrick, def.grade);
    brickCategories[def.grade] = created._id;
  }

  // ---------------- Machines ----------------
  console.log("Creating machines...");
  const machineDefs: Array<{ name: string; type: any; identifier?: string }> = [
    { name: "Tractor 1", type: "TRACTOR", identifier: "HR-46-A-1234" },
    { name: "Tractor 2", type: "TRACTOR", identifier: "HR-46-A-5678" },
    { name: "Delivery Truck 1", type: "TRUCK", identifier: "HR-46-B-1111" },
    { name: "JCB Excavator", type: "JCB", identifier: "HR-46-C-2222" },
    { name: "Pug Mill", type: "PUG_MILL" },
    { name: "Molding Machine", type: "MOLDING_MACHINE" },
    { name: "Weighbridge", type: "WEIGHBRIDGE" },
    { name: "Generator Set (62.5 KVA)", type: "GENERATOR" },
    { name: "Submersible Pump", type: "PUMP" },
  ];
  const machines = await Promise.all(machineDefs.map((m) => createMachine({ kilnId, seasonId, ...m })));

  // ---------------- Compliance documents ----------------
  console.log("Creating compliance documents...");
  await createComplianceDocument({
    kilnId,
    documentType: "PCB_CONSENT_TO_OPERATE",
    title: "Pollution Control Board — Consent to Operate",
    issueDate: dateAtOffset(300),
    expiryDate: dateAtOffset(-20), // expires in 20 days -> demo warning
  });
  await createComplianceDocument({
    kilnId,
    documentType: "MINING_ROYALTY_LICENSE",
    title: "Mining & Royalty License",
    issueDate: dateAtOffset(200),
    expiryDate: dateAtOffset(-120),
  });
  await createComplianceDocument({
    kilnId,
    documentType: "ZIG_ZAG_CERTIFICATE",
    title: "Zig-Zag Conversion Certificate",
    issueDate: dateAtOffset(400),
    expiryDate: dateAtOffset(5), // already expired -> demo alert
  });
  await createComplianceDocument({
    kilnId,
    documentType: "ENVIRONMENTAL_CLEARANCE",
    title: "Environmental Clearance",
    issueDate: dateAtOffset(500),
    expiryDate: dateAtOffset(-300),
  });

  // ---------------- Chamber cycles (stacking -> firing -> grading) ----------------
  // dayOffset: how many days ago. Higher = further in the past.
  type Cycle = { gherIdx: number; stackFrom: number; stackTo: number; fireFrom: number; fireTo: number; gradeAt?: number };
  const cycles: Cycle[] = [
    { gherIdx: 0, stackFrom: 40, stackTo: 36, fireFrom: 35, fireTo: 29, gradeAt: 28 },
    { gherIdx: 1, stackFrom: 34, stackTo: 30, fireFrom: 29, fireTo: 23, gradeAt: 22 },
    { gherIdx: 2, stackFrom: 25, stackTo: 21, fireFrom: 20, fireTo: 14, gradeAt: 13 },
    { gherIdx: 3, stackFrom: 16, stackTo: 12, fireFrom: 11, fireTo: 5, gradeAt: 4 },
    { gherIdx: 4, stackFrom: 7, stackTo: 3, fireFrom: 2, fireTo: 0 }, // still firing today
    { gherIdx: 5, stackFrom: 2, stackTo: 0, fireFrom: -1, fireTo: -1 }, // still stacking today
  ];

  const fireGherByDay = new Map<number, number[]>(); // dayOffset -> gher indices firing that day
  for (const c of cycles) {
    for (let d = c.fireFrom; d >= c.fireTo; d--) {
      if (!fireGherByDay.has(d)) fireGherByDay.set(d, []);
      fireGherByDay.get(d)!.push(c.gherIdx);
    }
  }

  // gher #6 (index 6) parked at READY, waiting to be opened — demo variety
  await updateGherStatus(kilnId, seasonId, ghers[6]._id, "STACKING");
  await updateGherStatus(kilnId, seasonId, ghers[6]._id, "READY");

  // ---------------- Raw material stock baseline ----------------
  await recordStockEntry({ kilnId, seasonId, type: "RAW_MATERIAL", itemName: "Soil (Weathering Yard)", quantity: randInt(80, 150), unit: "trolleys" });
  await recordStockEntry({ kilnId, seasonId, type: "RAW_MATERIAL", itemName: "Sand", quantity: randInt(20, 60), unit: "trolleys" });
  await recordStockEntry({ kilnId, seasonId, type: "RAW_MATERIAL", itemName: "Diesel (HSD)", quantity: randInt(200, 600), unit: "litres" });

  // ---------------- Day-by-day operational history ----------------
  console.log(`Generating ${TOTAL_DAYS} days of operational history (soil, molding, stacking, firing, attendance, dispatch, expenses)...`);

  let dispatchSlipCount = 0;

  for (let dayOffset = TOTAL_DAYS - 1; dayOffset >= 0; dayOffset--) {
    const isRainDay = Math.random() < 0.08;

    // --- Soil trips (1-3/day, skip on rain days) ---
    if (!isRainDay && Math.random() < 0.75) {
      const tripsToday = randInt(1, 3);
      for (let i = 0; i < tripsToday; i++) {
        const landowner = randChoice(landowners);
        const driver = randChoice(drivers);
        await createSoilTrip({
          kilnId,
          seasonId,
          landownerId: landowner._id,
          driverId: driver._id,
          tractorNumber: `HR-46-${randChoice(["A", "B"])}-${randInt(1000, 9999)}`,
          trolleyCount: randInt(1, 4),
          ratePerTrolley: randInt(280, 380),
          driverRatePerTrolley: randInt(100, 150),
          depthFeet: randInt(7, 15),
          date: dateAtOffset(dayOffset),
        });
      }
    }

    // --- Molding (pathai) ---
    if (Math.random() < 0.9) {
      const activeWorkers = workers.filter(() => Math.random() < 0.7);
      for (const worker of activeWorkers) {
        await createMoldingEntry({
          kilnId,
    seasonId,
          workerId: worker._id,
          bricksCount: randInt(2500, 6000),
          ratePerThousand: (worker as any).ratePerThousand ?? 400,
          date: dateAtOffset(dayOffset),
          washedOut: isRainDay,
        });
      }
      if (isRainDay) {
        await logWastage({
          kilnId,
    seasonId,
          type: "KACCHI_BRICK",
          cause: "RAIN",
          quantity: randInt(500, 2000),
          unit: "bricks",
          date: dateAtOffset(dayOffset),
          notes: "Unseasonal rain washed out drying-yard bricks",
        });
        await logWastage({
          kilnId,
    seasonId,
          type: "SOIL",
          cause: "RAIN",
          quantity: randInt(1, 4),
          unit: "trolley",
          date: dateAtOffset(dayOffset),
        });
      }
    }

    // --- Stacking for any chamber currently in its stacking window ---
    for (const c of cycles) {
      if (dayOffset <= c.stackFrom && dayOffset >= c.stackTo) {
        const gang = randChoice(contractors);
        await createStackingEntry({
          kilnId,
    seasonId,
          gherId: ghers[c.gherIdx]._id,
          gangId: gang._id,
          stage: randChoice(["TRANSPORT", "CHAMBER_STACKING"] as const),
          bricksCount: randInt(8000, 15000),
          damageCount: randInt(0, 150),
          qualityRating: randChoice(["GOOD", "GOOD", "AVERAGE", "POOR"] as const),
          date: dateAtOffset(dayOffset),
        });
      }
    }

    // --- Chamber transitions to FIRING on the day its cycle starts firing ---
    for (const c of cycles) {
      if (dayOffset === c.fireFrom) {
        await updateGherStatus(kilnId, seasonId, ghers[c.gherIdx]._id, "FIRING");
      }
    }

    // --- Firing: shifts + fuel for whichever chambers are firing today ---
    const firingToday = fireGherByDay.get(dayOffset) ?? [];
    if (firingToday.length > 0) {
      for (const shiftType of ["DAY", "NIGHT"] as const) {
        const fitter = randChoice(fitters);
        await createFiringShift({
          kilnId,
    seasonId,
          fitterId: fitter._id,
          gherId: ghers[firingToday[0]]._id,
          shiftType,
          handoverNotes: shiftType === "NIGHT" ? "Fire steady at chamber center, coal fed at 11pm and 3am" : "Fire position normal, handed over clean",
          overtimeHours: Math.random() < 0.3 ? randInt(1, 3) : 0,
          overtimeRate: 50,
          bonusAmount: Math.random() < 0.15 ? randInt(200, 500) : 0,
          date: dateAtOffset(dayOffset, shiftType === "DAY" ? randInt(7, 11) : randInt(19, 23)),
        });
      }
      for (const gherIdx of firingToday) {
        await createFuelLog({
          kilnId,
    seasonId,
          gherId: ghers[gherIdx]._id,
          fuelType: randChoice(["COAL", "COAL", "TUDI", "LAKDI"] as const),
          quantityKg: randInt(700, 1400),
          date: dateAtOffset(dayOffset),
        });
      }
    }

    // --- Fuel purchases every ~4 days ---
    if (dayOffset % 4 === 0) {
      const supplier = randChoice(suppliers);
      const invoiced = randInt(8000, 16000);
      const shortfall = Math.random() < 0.3 ? randInt(50, 400) : randInt(0, 50);
      await createFuelPurchase({
        kilnId,
        seasonId,
        fuelType: randChoice(["COAL", "COAL", "TUDI"] as const),
        supplierId: supplier._id,
        invoicedWeightKg: invoiced,
        actualWeightKg: invoiced - shortfall,
        amount: Math.round(invoiced * randFloat(8, 11)),
        date: dateAtOffset(dayOffset),
        notes: shortfall > 200 ? "Weighbridge slip attached — noticeable shortfall this load" : undefined,
      });
    }

    // --- Chamber grading when a cycle's fire completes ---
    for (const c of cycles) {
      if (c.gradeAt === dayOffset) {
        const stackedApprox = randInt(35000, 55000);
        const a1 = Math.round(stackedApprox * randFloat(0.72, 0.85));
        const jhama = Math.round(stackedApprox * randFloat(0.06, 0.1));
        const pela = Math.round(stackedApprox * randFloat(0.03, 0.06));
        const roda = Math.round(stackedApprox * randFloat(0.01, 0.03));
        await createChamberGrading({
          kilnId,
          seasonId,
          gherId: ghers[c.gherIdx]._id,
          items: [
            { categoryId: brickCategories.A1, bricksCount: a1 },
            { categoryId: brickCategories.Jhama, bricksCount: jhama },
            { categoryId: brickCategories.Pela, bricksCount: pela },
            { categoryId: brickCategories.Roda, bricksCount: roda },
          ],
          date: dateAtOffset(dayOffset),
          notes: "Chamber opened, quality graded and moved to godown",
        });
        await createProductionLog({
          kilnId,
          seasonId,
          batchNumber: `B-${dateAtOffset(dayOffset).getFullYear()}-${String(ghers[c.gherIdx].number).padStart(2, "0")}-${dayOffset}`,
          bricksCount: a1 + jhama + pela + roda,
          qualityGrade: "A",
          thekedarId: Math.random() < 0.3 ? randChoice(thekedars)._id : undefined,
          producedOn: dateAtOffset(dayOffset),
        });
      }
    }

    // --- Attendance for workers/helpers/fitters ---
    for (const person of [...workers, ...helpers]) {
      if (Math.random() < 0.05) continue; // occasional record gap, mirrors real-world data entry
      const roll = Math.random();
      const status = roll < 0.82 ? "PRESENT" : roll < 0.93 ? "HALF_DAY" : "ABSENT";
      const dailyWage = (person as any).dailyWage as number | undefined;
      await markAttendance({
        kilnId,
        personId: person._id,
        date: dateAtOffset(dayOffset, 9),
        status,
        wageAmount: dailyWage ? (status === "HALF_DAY" ? dailyWage / 2 : status === "PRESENT" ? dailyWage : 0) : undefined,
      });
    }

    // --- Dispatch to customers, every couple of days ---
    if (dayOffset % 2 === 0 && Math.random() < 0.85) {
      const customer = randChoice(customers);
      const driver = randChoice(drivers);
      const grade = randChoice(["A1", "A1", "JHAMA", "PELA"] as const);
      const bricksCount = randInt(3000, 12000);
      const pricePerThousand = grade === "A1" ? randInt(7000, 8200) : grade === "JHAMA" ? randInt(4800, 5800) : randInt(3200, 4200);
      const amount = Math.round((bricksCount / 1000) * pricePerThousand);
      const dispatch = await createDispatch({
        kilnId,
    seasonId,
        customerName: customer.name,
        customerId: customer._id,
        grade,
        bricksCount,
        amount,
        driverId: driver._id,
        transportCost: randInt(500, 2500),
        transportPaidBy: randChoice(["OWNER", "CUSTOMER"] as const),
        paymentMode: randChoice(["CASH", "BANK", "UPI", "GST_INVOICE"] as const),
        dispatchedOn: dateAtOffset(dayOffset),
      });
      dispatchSlipCount++;

      const palledar = randChoice(palledars);
      await createLoadingEntry({
        kilnId,
    seasonId,
        dispatchId: dispatch._id,
        palledarId: palledar._id,
        bricksCount,
        ratePerThousand: randInt(150, 200),
        date: dateAtOffset(dayOffset),
      });

      // Occasional post-delivery return/breakage adjustment
      if (Math.random() < 0.12) {
        await recordDeliveryAdjustment(kilnId, dispatch._id, {
          breakageCount: randInt(20, 150),
          returnedCount: Math.random() < 0.4 ? randInt(50, 300) : 0,
          returnReason: "Cracked bricks found on unloading, partial load returned",
        });
      }
    }

    // --- Expenses, scattered across categories ---
    const expenseChance = Math.random();
    if (expenseChance < 0.6) {
      const category = randChoice([
        "PETTY_CASH",
        "TUBEWELL_DIESEL",
        "TUBEWELL_ELECTRICITY",
        "WATER",
        "LOCAL_CHANDA",
        "DRIVER_BHATTA",
        "TRANSIT_TAX",
      ] as const);
      const amountRanges: Record<string, [number, number]> = {
        PETTY_CASH: [100, 600],
        TUBEWELL_DIESEL: [500, 1800],
        TUBEWELL_ELECTRICITY: [400, 1200],
        WATER: [200, 700],
        LOCAL_CHANDA: [500, 2500],
        DRIVER_BHATTA: [200, 500],
        TRANSIT_TAX: [300, 1000],
      };
      const [lo, hi] = amountRanges[category];
      await createExpense({
        kilnId,
    seasonId,
        category,
        amount: randInt(lo, hi),
        date: dateAtOffset(dayOffset),
      });
    }
    if (dayOffset % 6 === 0) {
      await createExpense({
        kilnId,
    seasonId,
        category: "JCB_RENTAL",
        amount: randInt(3000, 6000),
        hours: randInt(4, 8),
        date: dateAtOffset(dayOffset),
        notes: "Soil excavation at khet",
      });
    }
    if (dayOffset % 5 === 0) {
      await createExpense({
        kilnId,
    seasonId,
        category: "MOLD_SAND",
        amount: randInt(2000, 5000),
        date: dateAtOffset(dayOffset),
      });
    }
    if (dayOffset % 9 === 0) {
      await createExpense({
        kilnId,
    seasonId,
        category: "ROYALTY_CHALLAN",
        amount: randInt(1500, 4000),
        date: dateAtOffset(dayOffset),
      });
    }
  }

  console.log(`Generated ${dispatchSlipCount} dispatches with loading entries.`);

  // ---------------- Kiln incidents (a couple of unplanned events) ----------------
  console.log("Creating kiln incidents...");
  await createKilnIncident({
    kilnId,
    seasonId,
    gherId: ghers[2]._id,
    type: "CRACK_LEAKAGE",
    description: "Crack developed in chamber wall during firing, emergency patchwork done",
    repairCost: randInt(3000, 8000),
    bricksLost: randInt(200, 800),
    date: dateAtOffset(18),
  });
  await createKilnIncident({
    kilnId,
    seasonId,
    type: "WEATHER_FLOODING",
    description: "Sudden rain flooded the drying yard overnight",
    repairCost: 0,
    bricksLost: randInt(500, 1500),
    date: dateAtOffset(9),
  });
  await createKilnIncident({
    kilnId,
    seasonId,
    type: "ELECTRICAL_FAILURE",
    description: "Blower motor burnout, replaced same day",
    repairCost: randInt(4000, 9000),
    bricksLost: 0,
    date: dateAtOffset(3),
  });

  // ---------------- Machine fuel + maintenance logs ----------------
  console.log("Creating machine fuel and maintenance logs...");
  for (const machine of machines) {
    if (machine.type === "TRACTOR" || machine.type === "TRUCK" || machine.type === "JCB") {
      for (let i = 0; i < 6; i++) {
        const dayOffset = randInt(0, TOTAL_DAYS - 1);
        await createMachineFuelLog({
          kilnId,
    seasonId,
          machineId: machine._id,
          fuelType: "DIESEL",
          quantity: randInt(15, 45),
          hoursRun: randInt(4, 10),
          date: dateAtOffset(dayOffset),
        });
      }
    }
    if (machine.type === "GENERATOR" || machine.type === "PUMP") {
      for (let i = 0; i < 4; i++) {
        const dayOffset = randInt(0, TOTAL_DAYS - 1);
        await createMachineFuelLog({
          kilnId,
    seasonId,
          machineId: machine._id,
          fuelType: randChoice(["DIESEL", "ELECTRICITY"] as const),
          quantity: randInt(10, 60),
          hoursRun: randInt(3, 12),
          date: dateAtOffset(dayOffset),
        });
      }
    }
  }
  await createMaintenanceLog({
    kilnId,
    seasonId,
    machineId: machines[3]._id, // JCB
    description: "Hydraulic hose replaced",
    cost: randInt(2000, 6000),
    downtimeHours: randInt(2, 6),
    date: dateAtOffset(14),
  });
  await createMaintenanceLog({
    kilnId,
    seasonId,
    machineId: machines[4]._id, // Pug mill
    description: "Blade sharpening and belt replacement",
    cost: randInt(1500, 4000),
    downtimeHours: randInt(3, 8),
    date: dateAtOffset(6),
  });

  // ---------------- Stock audit ----------------
  console.log("Creating stock audits...");
  await createStockAudit({
    kilnId,
    seasonId,
    itemName: "Bricks (A-1 Grade)",
    physicalCount: randInt(15000, 40000),
    date: dateAtOffset(2),
    notes: "Season-end physical count of godown stock",
  });
  await createStockAudit({
    kilnId,
    seasonId,
    itemName: "Diesel (HSD)",
    physicalCount: randInt(150, 500),
    date: dateAtOffset(1),
  });

  // ---------------- Ledger settlements (partial payments so balances look realistic) ----------------
  console.log("Recording partial ledger settlements...");

  async function currentBalance(personId: string) {
    const entries = await db.select().from(ledgerEntries).where(eq(ledgerEntries.personId, personId));
    return entries.reduce((sum, e) => sum + (e.direction === "DUE" ? e.amount : -e.amount), 0);
  }

  async function settlePartially(personId: string, fraction: number, reason: string) {
    const balance = await currentBalance(personId);
    if (balance <= 0) return;
    const payAmount = Math.round(balance * fraction);
    if (payAmount <= 0) return;
    await addLedgerEntry({
      kilnId,
      personId,
      direction: "PAID",
      amount: payAmount,
      reason,
      date: dateAtOffset(randInt(0, 5)),
    });
  }

  for (const worker of workers) {
    await settlePartially(worker._id, randFloat(0.55, 0.85), "Wage settlement (weekly)");
  }
  for (const helper of helpers) {
    await settlePartially(helper._id, randFloat(0.55, 0.85), "Wage settlement (weekly)");
  }
  for (const driver of drivers) {
    await settlePartially(driver._id, randFloat(0.5, 0.8), "Trip fee settlement");
  }
  for (const landowner of landowners) {
    await settlePartially(landowner._id, randFloat(0.4, 0.7), "Soil payment settlement");
  }
  for (const contractor of contractors) {
    await settlePartially(contractor._id, randFloat(0.5, 0.75), "Bharai/loading wage settlement");
  }
  for (const fitter of fitters) {
    await settlePartially(fitter._id, randFloat(0.6, 0.9), "OT/bonus settlement");
  }
  // Leave one worker and one helper with a deliberately negative balance
  // (advance paid beyond earnings) so "Outstanding Advances" has data to show.
  await addLedgerEntry({
    kilnId,
    personId: workers[0]._id,
    direction: "PAID",
    amount: randInt(3000, 6000),
    reason: "Advance (peshgi) given",
    date: dateAtOffset(35),
  });
  await addLedgerEntry({
    kilnId,
    personId: helpers[0]._id,
    direction: "PAID",
    amount: randInt(2000, 4000),
    reason: "Advance (peshgi) given",
    date: dateAtOffset(20),
  });

  for (const customer of customers) {
    await settlePartially(customer._id, randFloat(0.3, 0.6), "Payment received against outstanding");
  }

  console.log("\nSeed complete.");
  console.log(`Kiln: ${kiln.name} (${kilnId})`);
  console.log("Log in with your existing account to see the populated dashboard.");

  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
