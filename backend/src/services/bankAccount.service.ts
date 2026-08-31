import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { db } from "../db/client";
import { bankAccounts } from "../db/schema";
import { emitToKiln } from "../config/socket";

export interface BankAccountInput {
  bankName: string;
  accountLabel?: string;
  accountNumberLast4?: string;
  openingBalance?: number;
  openingBalanceDate?: Date;
}

export async function createBankAccount(kilnId: string, input: BankAccountInput) {
  const _id = randomUUID();
  await db.insert(bankAccounts).values({ ...input, _id, kilnId });
  const row = (await db.select().from(bankAccounts).where(eq(bankAccounts._id, _id)))[0]!;
  emitToKiln(kilnId, "bankAccount:update", row);
  return row;
}

export async function listBankAccounts(kilnId: string) {
  return db.select().from(bankAccounts).where(eq(bankAccounts.kilnId, kilnId));
}

export async function getBankAccount(kilnId: string, bankAccountId: string) {
  const row = (await db.select().from(bankAccounts).where(and(eq(bankAccounts._id, bankAccountId), eq(bankAccounts.kilnId, kilnId))))[0];
  if (!row) throw new Error("Bank account not found in this kiln");
  return row;
}

export async function updateBankAccount(kilnId: string, bankAccountId: string, input: Partial<BankAccountInput>) {
  await getBankAccount(kilnId, bankAccountId);
  await db.update(bankAccounts).set(input).where(eq(bankAccounts._id, bankAccountId));
  const updated = (await db.select().from(bankAccounts).where(eq(bankAccounts._id, bankAccountId)))[0]!;
  emitToKiln(kilnId, "bankAccount:update", updated);
  return updated;
}
