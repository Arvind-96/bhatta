import "dotenv/config";
import { and, asc, count, desc, eq, isNotNull } from "drizzle-orm";
import { db, runMigrations } from "../db/client";
import { kilns, people, dispatches, nikasiEntries, brickLoadingEntries, brickCategories } from "../db/schema";

import { createPerson } from "../services/person.service";
import { listGhers } from "../services/gher.service";
import { createStackingEntry } from "../services/stacking.service";
import { createStackingVehicle } from "../services/stackingVehicle.service";
import { createNikasiEntry } from "../services/nikasi.service";
import { createBrickLoadingEntry } from "../services/brickLoading.service";
import { createBrickCategory } from "../services/brickCategory.service";
import { addLedgerEntry } from "../services/ledger.service";

// This is a companion to seed.ts, run separately, for the modules built
// after the original seed script: Bharai's stage/contractor hierarchy,
// Nikasi, Firing's shift rotation, Brick Loading, and Staff. seed.ts
// refuses to run twice (it skips once any Person exists), so this script
// checks its own per-feature markers instead — each section is independent
// and safe to re-run; it only fills in whatever hasn't been seeded yet.

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
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

async function paySalaryWithPartialSettlement(kilnId: string, personId: string, monthlySalary: number) {
  await addLedgerEntry({
    kilnId,
    personId,
    direction: "DUE",
    amount: monthlySalary,
    reason: "Monthly salary due",
    category: "SALARY",
    date: dateAtOffset(28),
  });
  const paidFraction = Math.random() * 0.35 + 0.5; // 50-85% settled, rest due
  await addLedgerEntry({
    kilnId,
    personId,
    direction: "PAID",
    amount: Math.round(monthlySalary * paidFraction),
    reason: "Salary payment",
    category: "SALARY",
    paymentMode: randChoice(["CASH", "BANK", "UPI"] as const),
    date: dateAtOffset(randInt(1, 10)),
  });
}

async function main() {
  await runMigrations();

  const kiln = (await db.select().from(kilns).orderBy(asc(kilns.createdAt)))[0];
  if (!kiln) {
    console.error("No kiln found. Register an owner account through the app first, then re-run this script.");
    process.exit(1);
  }
  const kilnId = kiln._id as string;
  console.log(`Seeding new-module test data into kiln "${kiln.name}" (${kilnId})`);

  const ghers = await listGhers(kilnId);
  if (ghers.length === 0) {
    console.error("No chambers set up yet — run `npm run seed` first.");
    process.exit(1);
  }

  // ---------------- Bharai: stage-tagged contractors, laborers, vehicles ----------------
  const hasStagedBharai = (await db.select({ c: count() }).from(people).where(and(eq(people.kilnId, kilnId), isNotNull(people.stackingStage))))[0]!.c > 0;
  if (hasStagedBharai) {
    console.log("Bharai stage/contractor data already present — skipping.");
  } else {
    console.log("Seeding Bharai (stacking) stage contractors, laborers, and vehicles...");

    const transportContractor = await createPerson({
      kilnId,
      type: "LABOUR_CONTRACTOR",
      name: "Rajesh Thekedar",
      phone: randPhone(),
      monthlySalary: 18000,
      stackingStage: "TRANSPORT",
    });
    const chamberContractor = await createPerson({
      kilnId,
      type: "LABOUR_CONTRACTOR",
      name: "Suresh Thekedar",
      phone: randPhone(),
      monthlySalary: 17000,
      stackingStage: "CHAMBER_STACKING",
    });

    const transportLaborers = await Promise.all(
      ["Deenu", "Ramkishan"].map((name) =>
        createPerson({
          kilnId,
          type: "WORKER",
          name,
          phone: randPhone(),
          monthlySalary: randInt(7000, 9000),
          bharaiContractorId: transportContractor._id,
          stackingStage: "TRANSPORT",
        })
      )
    );
    const chamberLaborers = await Promise.all(
      ["Sohan Lal", "Bhajan Lal"].map((name) =>
        createPerson({
          kilnId,
          type: "WORKER",
          name,
          phone: randPhone(),
          monthlySalary: randInt(7000, 9000),
          bharaiContractorId: chamberContractor._id,
          stackingStage: "CHAMBER_STACKING",
        })
      )
    );

    // One independent operator per stage, not under any thekedar
    const independentTransport = await createPerson({
      kilnId,
      type: "WORKER",
      name: "Ishwar Singh",
      phone: randPhone(),
      monthlySalary: 8500,
      stackingStage: "TRANSPORT",
    });
    const independentChamber = await createPerson({
      kilnId,
      type: "WORKER",
      name: "Mange Ram",
      phone: randPhone(),
      monthlySalary: 8000,
      stackingStage: "CHAMBER_STACKING",
    });

    await createStackingVehicle({
      kilnId,
      contractorId: transportContractor._id,
      vehicleType: "TRACTOR",
      vehicleNumber: `HR-46-A-${randInt(1000, 9999)}`,
      driverName: "Balwan",
    });
    await createStackingVehicle({
      kilnId,
      contractorId: transportContractor._id,
      vehicleType: "BUGGI",
      buggiCount: 3,
      driverName: "Ram Kumar",
    });

    for (let d = 12; d >= 0; d--) {
      const gher = randChoice(ghers);
      await createStackingEntry({
        kilnId,
        gherId: gher._id,
        gangId: randChoice([...transportLaborers, transportContractor])._id,
        stage: "TRANSPORT",
        bricksCount: randInt(3000, 6000),
        mode: randChoice(["TRACTOR", "BUGGI"] as const),
        tractorNumber: `HR-46-A-${randInt(1000, 9999)}`,
        date: dateAtOffset(d),
      });
      await createStackingEntry({
        kilnId,
        gherId: gher._id,
        gangId: randChoice(chamberLaborers)._id,
        stage: "CHAMBER_STACKING",
        bricksCount: randInt(3000, 6000),
        date: dateAtOffset(d),
      });
      if (d % 3 === 0) {
        await createStackingEntry({
          kilnId,
          gherId: randChoice(ghers)._id,
          gangId: independentTransport._id,
          stage: "TRANSPORT",
          bricksCount: randInt(2000, 4000),
          mode: "BUGGI",
          buggiCount: 2,
          date: dateAtOffset(d),
        });
        await createStackingEntry({
          kilnId,
          gherId: randChoice(ghers)._id,
          gangId: independentChamber._id,
          stage: "CHAMBER_STACKING",
          bricksCount: randInt(2000, 4000),
          date: dateAtOffset(d),
        });
      }
    }

    for (const p of [transportContractor, chamberContractor, ...transportLaborers, ...chamberLaborers, independentTransport, independentChamber]) {
      await paySalaryWithPartialSettlement(kilnId, p._id, p.monthlySalary as number);
    }
  }

  // ---------------- Nikasi: contractor, laborers, entries ----------------
  const hasNikasi = (await db.select({ c: count() }).from(nikasiEntries).where(eq(nikasiEntries.kilnId, kilnId)))[0]!.c > 0;
  if (hasNikasi) {
    console.log("Nikasi data already present — skipping.");
  } else {
    console.log("Seeding Nikasi (unloading) contractor, laborers, and entries...");

    const nikasiContractor = await createPerson({
      kilnId,
      type: "LABOUR_CONTRACTOR",
      name: "Om Prakash Thekedar",
      phone: randPhone(),
      monthlySalary: 16000,
    });
    const nikasiLaborers = await Promise.all(
      ["Dharam Pal", "Jile Singh"].map((name) =>
        createPerson({
          kilnId,
          type: "WORKER",
          name,
          phone: randPhone(),
          monthlySalary: randInt(7000, 8500),
          nikasiContractorId: nikasiContractor._id,
        })
      )
    );
    const independentNikasi = await createPerson({
      kilnId,
      type: "HELPER",
      name: "Bhim Singh",
      phone: randPhone(),
      monthlySalary: 7500,
    });

    for (let d = 10; d >= 0; d--) {
      await createNikasiEntry({
        kilnId,
        gherId: randChoice(ghers)._id,
        gangId: randChoice(nikasiLaborers)._id,
        bricksCount: randInt(3000, 7000),
        date: dateAtOffset(d),
      });
      if (d % 2 === 0) {
        await createNikasiEntry({
          kilnId,
          gherId: randChoice(ghers)._id,
          gangId: independentNikasi._id,
          bricksCount: randInt(2000, 5000),
          date: dateAtOffset(d),
        });
      }
    }

    for (const p of [nikasiContractor, ...nikasiLaborers, independentNikasi]) {
      await paySalaryWithPartialSettlement(kilnId, p._id, p.monthlySalary as number);
    }
  }

  // ---------------- Firing: 6-person shift-rotation team ----------------
  const hasRotation = (await db.select({ c: count() }).from(people).where(and(eq(people.kilnId, kilnId), isNotNull(people.firingShiftAnchorDate))))[0]!.c > 0;
  if (hasRotation) {
    console.log("Firing shift-rotation data already present — skipping.");
  } else {
    console.log("Seeding the 6-person firing rotation team...");

    const existingFitters = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "FITTER"))).orderBy(asc(people.name));
    const namesNeeded = 6 - existingFitters.length;
    const extraNames = ["Jagdish Fitter", "Mahesh Ostad"].slice(0, Math.max(0, namesNeeded));
    const newFitters = await Promise.all(
      extraNames.map((name) => createPerson({ kilnId, type: "FITTER", name, phone: randPhone() }))
    );
    const allFitters = [...existingFitters, ...newFitters].slice(0, 6);

    // Stagger anchors so roughly half the team is on days, half on nights,
    // all starting their current 3-day/3-night block a few days back.
    for (let i = 0; i < allFitters.length; i++) {
      const fitter = allFitters[i];
      const anchorType = i % 2 === 0 ? "DAY" : "NIGHT";
      const anchorDate = dateAtOffset(randInt(0, 5));
      anchorDate.setHours(0, 0, 0, 0);
      await db.update(people)
        .set({
          monthlySalary: fitter.monthlySalary ?? randInt(14000, 20000),
          firingShiftAnchorDate: anchorDate,
          firingShiftAnchorType: anchorType,
        })
        .where(eq(people._id, fitter._id));
      await paySalaryWithPartialSettlement(kilnId, fitter._id, fitter.monthlySalary ?? randInt(14000, 20000));
    }
  }

  // ---------------- Brick Loading: driver trips + tips ----------------
  const hasBrickLoading = (await db.select({ c: count() }).from(brickLoadingEntries).where(eq(brickLoadingEntries.kilnId, kilnId)))[0]!.c > 0;
  if (hasBrickLoading) {
    console.log("Brick loading data already present — skipping.");
  } else {
    console.log("Seeding brick loading trips...");

    let drivers = await db.select().from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "DRIVER")));
    if (drivers.length === 0) {
      drivers = await Promise.all(
        ["Naveen Driver", "Rakesh Driver"].map((name) =>
          createPerson({
            kilnId,
            type: "DRIVER",
            name,
            phone: randPhone(),
            vehicleNumber: `HR-46-B-${randInt(1000, 9999)}`,
          })
        )
      );
    }

    let seedCategories = await db.select().from(brickCategories).where(eq(brickCategories.kilnId, kilnId));
    if (seedCategories.length === 0) {
      const created = await createBrickCategory(kilnId, "A-1 Grade", 7, "A1");
      seedCategories = [created];
    }

    for (let d = 14; d >= 0; d--) {
      if (Math.random() < 0.55) continue;
      const driver = randChoice(drivers);
      const seedCategory = randChoice(seedCategories);
      await createBrickLoadingEntry({
        kilnId,
        vehicleType: randChoice(["TRUCK", "TRACTOR"] as const),
        vehicleNumber: driver.vehicleNumber || `HR-46-B-${randInt(1000, 9999)}`,
        items: [{ categoryId: seedCategory._id, pricePerBrick: seedCategory.pricePerBrick ?? 7, bricksCount: randInt(3000, 9000) }],
        date: dateAtOffset(d),
      });
    }
  }

  // ---------------- Staff: Munim, Chowkidar, office Helper/Driver ----------------
  const hasStaff = (await db.select({ c: count() }).from(people).where(and(eq(people.kilnId, kilnId), eq(people.type, "MUNIM"))))[0]!.c > 0;
  if (hasStaff) {
    console.log("Staff roster already present — skipping.");
  } else {
    console.log("Seeding bhatta administration & personnel (Staff)...");

    const mainMunim = await createPerson({
      kilnId,
      type: "MUNIM",
      name: "Ramesh Sharma",
      phone: randPhone(),
      designation: "Main Munim",
      monthlySalary: 25000,
    });
    const juniorMunims = await Promise.all(
      ["Anil Kumar", "Sunil Verma"].map((name, i) =>
        createPerson({
          kilnId,
          type: "MUNIM",
          name,
          phone: randPhone(),
          designation: `Junior Munim ${i + 1}`,
          monthlySalary: 15000,
        })
      )
    );
    const officeHelpers = await Promise.all(
      ["Prakash Chand", "Devi Lal"].map((name, i) =>
        createPerson({
          kilnId,
          type: "HELPER",
          name,
          phone: randPhone(),
          designation: `Office Helper ${i + 1}`,
          isOfficeStaff: true,
          monthlySalary: 8000,
        })
      )
    );
    const chowkidar = await createPerson({
      kilnId,
      type: "CHOWKIDAR",
      name: "Bahadur Singh",
      phone: randPhone(),
      designation: "Chowkidar",
      monthlySalary: 9000,
    });
    const staffDriver = await createPerson({
      kilnId,
      type: "DRIVER",
      name: "Mahender Driver",
      phone: randPhone(),
      designation: "Staff Driver",
      isOfficeStaff: true,
      vehicleNumber: `HR-46-D-${randInt(1000, 9999)}`,
      monthlySalary: 12000,
    });

    for (const p of [mainMunim, ...juniorMunims, ...officeHelpers, chowkidar, staffDriver]) {
      await paySalaryWithPartialSettlement(kilnId, p._id, p.monthlySalary as number);
    }
  }

  console.log("\nNew-module seed complete.");
  process.exit(0);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
