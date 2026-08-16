import express from "express";
import cors from "cors";
import { createServer } from "http";
import { env } from "./config/env";
import { runMigrations } from "./db/client";
import { initSocket } from "./config/socket";
import { registerSocketHandlers } from "./sockets";
import { apiRouter } from "./routes";
import { errorMiddleware } from "./middleware/error.middleware";

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
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api", apiRouter);
app.use(errorMiddleware);

const httpServer = createServer(app);
initSocket(httpServer);
registerSocketHandlers();

runMigrations();

httpServer.listen(env.port, () => {
  console.log(`Bhatta Cloud API running on http://localhost:${env.port}`);
});
