import { double, mysqlTable, varchar, text, boolean, index } from "drizzle-orm/mysql-core";
import { idColumn, kilnIdColumn, createdAtColumn, dateColumn, SIMPLE_PAYMENT_MODES } from "./_helpers";

// A doctor who visits the kiln to treat sick staff/labour — a simple
// standalone roster (name/contact/qualification), same shape as
// machines/kilnVehicles in fleet.ts, not a `people` row: a doctor has no
// running ledger balance with the kiln (consultation fees are paid per
// visit, logged straight to Expenses — see doctorVisits below), so the
// Person polymorphic table's balance/ledger machinery doesn't apply here.
export const doctors = mysqlTable("doctors", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  name: varchar("name", { length: 255 }).notNull(),
  phone: varchar("phone", { length: 255 }),
  qualification: varchar("qualification", { length: 255 }),
  clinicAddress: text("clinicAddress"),
  notes: text("notes"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAtColumn(),
}, (t) => ({ kilnIdx: index("doctor_kiln_idx").on(t.kilnId) }));

// One row per visit: a doctor treating one person (any `people` row --
// labour, staff, thekedar, etc, whoever fell sick) on a given day.
// medicineCost + consultationFee together become one auto-logged Expense
// the moment the visit is created (see doctorVisit.service.ts's
// createDoctorVisit calling expense.service.ts's autoLogExpense, the same
// auto-log pattern brickLoading/dispatch use for driver reward/loading
// charges) -- the admin never has to log the same cost twice, and editing
// or deleting a visit keeps the linked Expense row in sync via
// expenses.doctorVisitId.
export const doctorVisits = mysqlTable("doctor_visits", {
  _id: idColumn(),
  kilnId: kilnIdColumn(),
  seasonId: varchar("seasonId", { length: 64 }),
  doctorId: varchar("doctorId", { length: 64 }).notNull(),
  personId: varchar("personId", { length: 64 }).notNull(),
  ailment: text("ailment"),
  medicineCost: double("medicineCost").notNull().default(0),
  consultationFee: double("consultationFee").notNull().default(0),
  // The same simpler Cash/Online/Cash+Online choice as Expense/Driver
  // Reward/Loading/Unloading Charge (SIMPLE_PAYMENT_MODES) — this value
  // flows straight through to the auto-logged Expense row's own
  // paymentMode (see doctorVisit.service.ts), which is SIMPLE_PAYMENT_MODES
  // too, so the two must stay in the same enum.
  paymentMode: varchar("paymentMode", { length: 20, enum: SIMPLE_PAYMENT_MODES }),
  cashAmount: double("cashAmount"),
  onlineAmount: double("onlineAmount"),
  date: dateColumn(),
  notes: text("notes"),
  createdAt: createdAtColumn(),
}, (t) => ({
  kilnDateIdx: index("doctorvisit_kiln_date_idx").on(t.kilnId, t.date),
  kilnPersonIdx: index("doctorvisit_kiln_person_idx").on(t.kilnId, t.personId),
  kilnDoctorIdx: index("doctorvisit_kiln_doctor_idx").on(t.kilnId, t.doctorId),
}));
