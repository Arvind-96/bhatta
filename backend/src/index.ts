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

runMigrations();

// Midnight on the 1st of every month, server-local time: generates the
// just-completed month's salary slip for every staff member with a
// monthlySalary set, across every kiln. Safe to also trigger manually
// (Salary page's "Generate now") — regenerating an existing slip just
// overwrites it with current attendance data, never duplicates.
cron.schedule("0 0 1 * *", () => {
  runMonthlySalaryGeneration()
    .then((result) => console.log(`[salary-cron] ${result.month}: ${result.generated} generated, ${result.failed.length} failed`))
    .catch((err) => console.error("[salary-cron] failed:", err));
});

httpServer.listen(env.port, () => {
  console.log(`Bhatta Cloud API running on http://localhost:${env.port}`);
});
