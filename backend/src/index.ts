import express from "express";
import cors from "cors";
import cron from "node-cron";
import { createServer } from "http";
import { env, isAllowedOrigin } from "./config/env";
import { runMigrations } from "./db/client";
import { initSocket } from "./config/socket";
import { registerSocketHandlers } from "./sockets";
import { apiRouter } from "./routes";
import { errorMiddleware } from "./middleware/error.middleware";
import { runMonthlySalaryGeneration } from "./services/salary.service";
import { runScheduledLaborReportGeneration } from "./services/laborReportSchedule.service";

// Last-resort safety net: every route already goes through asyncHandler
// (see middleware/asyncHandler.ts) so a request-level error becomes a JSON
// response, never a crash. These two catch anything that still slips past
// that — a bug in a socket handler, a stray unawaited promise — and log it
// instead of letting Node's default behaviour take the whole process down.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  console.error("[uncaughtException]", err);
});

const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) return callback(null, true);
      callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", apiRouter);
app.use(errorMiddleware);

const httpServer = createServer(app);
initSocket(httpServer);
registerSocketHandlers();

// Migrations must finish before the server accepts requests — unlike
// better-sqlite3's synchronous migrate(), mysql2's is a real async
// round-trip, so the rest of startup waits on it instead of firing
// concurrently.
async function start() {
  await runMigrations();

  // Midnight IST on the 1st of every month: generates the just-completed
  // month's salary slip for every staff member with a monthlySalary set,
  // across every kiln. Safe to also trigger manually (Salary page's
  // "Generate now") — regenerating an existing slip just overwrites it
  // with current attendance data, never duplicates.
  //
  // Bug fix: this used to run at server-local midnight with no explicit
  // timezone — currently harmless since the VPS runs UTC (server midnight
  // = IST 5:30am, still the 1st), but fragile: a server timezone change
  // ahead of IST would generate "last month" a calendar day early relative
  // to the business's real IST clock. Pinning the timezone explicitly
  // makes this correct regardless of what timezone the server process
  // itself ends up running in.
  cron.schedule("0 0 1 * *", () => {
    runMonthlySalaryGeneration()
      .then((result) => console.log(`[salary-cron] ${result.month}: ${result.generated} generated, ${result.failed.length} failed`))
      .catch((err) => console.error("[salary-cron] failed:", err));
  }, { timezone: "Asia/Kolkata" });

  // 2am IST daily: for every kiln that's picked at least one day-of-month
  // on Settings, checks whether today is one of them and records a new
  // labor-work-report period boundary if so (see
  // laborReportSchedule.service.ts — this never posts to the ledger or
  // duplicates production data, purely a "period closed" marker). Same
  // explicit-timezone fix as the salary cron above, for the same reason —
  // "today" here needs to mean the business's IST calendar day.
  cron.schedule("0 2 * * *", () => {
    runScheduledLaborReportGeneration()
      .then((results) => {
        if (results.length) console.log(`[labor-report-cron] generated ${results.length} period(s)`);
      })
      .catch((err) => console.error("[labor-report-cron] failed:", err));
  }, { timezone: "Asia/Kolkata" });

  httpServer.listen(env.port, () => {
    console.log(`Bhatta Cloud API running on http://localhost:${env.port}`);
  });
}

start().catch((err) => {
  console.error("[startup] failed to start server:", err);
  process.exit(1);
});
