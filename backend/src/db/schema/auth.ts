import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { idColumn, createdAtColumn } from "./_helpers";

export const kilns = sqliteTable("kilns", {
  _id: idColumn(),
  name: text("name").notNull(),
  location: text("location"),
  phone: text("phone"),
  onboardedAt: integer("onboardedAt", { mode: "timestamp_ms" }),
  latitude: real("latitude"),
  longitude: real("longitude"),
  radiusMeters: integer("radiusMeters").default(200),
  yardCapacityBricks: integer("yardCapacityBricks"),
  // The bhatta season, e.g. Aug 1 – Jul 31 by default — used for
  // season-scoped reporting. Month is 1-12, day is 1-31.
  seasonStartMonth: integer("seasonStartMonth").default(8),
  seasonStartDay: integer("seasonStartDay").default(1),
  createdAt: createdAtColumn(),
});

export const users = sqliteTable("users", {
  _id: idColumn(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  passwordHash: text("passwordHash").notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({
  emailUnique: uniqueIndex("users_email_unique").on(t.email),
}));

export const kilnMemberships = sqliteTable("kiln_memberships", {
  _id: idColumn(),
  userId: text("userId").notNull(),
  kilnId: text("kilnId").notNull(),
  role: text("role", { enum: ["OWNER", "MANAGER", "MUNIM"] }).notNull(),
  createdAt: createdAtColumn(),
}, (t) => ({
  userKilnUnique: uniqueIndex("membership_user_kiln_unique").on(t.userId, t.kilnId),
}));

export const syncLogs = sqliteTable("sync_logs", {
  _id: idColumn(),
  kilnId: text("kilnId").notNull(),
  entityType: text("entityType").notNull(),
  entityId: text("entityId").notNull(),
  action: text("action").notNull(),
  status: text("status").default("APPLIED"),
  createdAt: createdAtColumn(),
});
