import { Response } from "express";
import { z } from "zod";
import { AuthedRequest } from "../middleware/auth.middleware";
import { BANK_TRANSACTION_DIRECTIONS } from "../db/schema";
import {
  bulkCreateBankTransactions,
  createBankTransaction,
  listBankTransactions,
  listUnmatchedBookEntries,
  matchTransaction,
  unmatchTransaction,
  bankReconciliationSummary,
  type BookEntryType,
} from "../services/bankTransaction.service";

const rowSchema = z.object({
  date: z.coerce.date().optional(),
  description: z.string().optional(),
  amount: z.number().positive(),
  direction: z.enum(BANK_TRANSACTION_DIRECTIONS),
  notes: z.string().optional(),
});

const createSchema = rowSchema.extend({ bankAccountId: z.string() });
const bulkCreateSchema = z.object({ bankAccountId: z.string(), rows: z.array(rowSchema).min(1) });

const BOOK_ENTRY_TYPES = ["LEDGER", "INVOICE", "EXPENSE", "SUPPLIER_INVOICE"] as const;
const matchSchema = z.object({ entryType: z.enum(BOOK_ENTRY_TYPES), entryId: z.string() });

export async function create(req: AuthedRequest, res: Response) {
  const input = createSchema.parse(req.body);
  res.status(201).json(await createBankTransaction(req.kiln!.id, req.season!.id, input));
}

export async function bulkCreate(req: AuthedRequest, res: Response) {
  const { bankAccountId, rows } = bulkCreateSchema.parse(req.body);
  res.status(201).json(await bulkCreateBankTransactions(req.kiln!.id, req.season!.id, bankAccountId, rows));
}

export async function list(req: AuthedRequest, res: Response) {
  const { bankAccountId, reconciled, from, to } = req.query;
  if (typeof bankAccountId !== "string") throw new Error("bankAccountId is required");
  res.json(
    await listBankTransactions(req.kiln!.id, bankAccountId, {
      reconciled: reconciled === "true" ? true : reconciled === "false" ? false : undefined,
      from: typeof from === "string" ? new Date(from) : undefined,
      to: typeof to === "string" ? new Date(to) : undefined,
    })
  );
}

export async function unmatchedBookEntries(req: AuthedRequest, res: Response) {
  const { from, to } = req.query;
  if (typeof from !== "string" || typeof to !== "string") throw new Error("from and to are required");
  res.json(await listUnmatchedBookEntries(req.kiln!.id, new Date(from), new Date(to)));
}

export async function match(req: AuthedRequest, res: Response) {
  const { entryType, entryId } = matchSchema.parse(req.body);
  res.json(await matchTransaction(req.kiln!.id, req.params.id, entryType as BookEntryType, entryId));
}

export async function unmatch(req: AuthedRequest, res: Response) {
  res.json(await unmatchTransaction(req.kiln!.id, req.params.id));
}

export async function summary(req: AuthedRequest, res: Response) {
  const { bankAccountId, from, to } = req.query;
  if (typeof bankAccountId !== "string") throw new Error("bankAccountId is required");
  res.json(
    await bankReconciliationSummary(
      req.kiln!.id,
      bankAccountId,
      typeof from === "string" ? new Date(from) : undefined,
      typeof to === "string" ? new Date(to) : undefined
    )
  );
}
