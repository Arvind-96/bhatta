import { randomUUID } from "crypto";
import { and, asc, eq, lte } from "drizzle-orm";
import { db } from "../db/client";
import { complianceDocuments, COMPLIANCE_DOCUMENT_TYPES } from "../db/schema";
import { emitToKiln } from "../config/socket";

export type ComplianceDocumentType = (typeof COMPLIANCE_DOCUMENT_TYPES)[number];

const EXPIRY_WARNING_DAYS = 30;

export interface CreateComplianceDocInput {
  kilnId: string;
  documentType: ComplianceDocumentType;
  title: string;
  issueDate?: Date;
  expiryDate: Date;
  notes?: string;
}

export async function createComplianceDocument(input: CreateComplianceDocInput) {
  const _id = randomUUID();
  db.insert(complianceDocuments).values({ ...input, _id }).run();
  const doc = db.select().from(complianceDocuments).where(eq(complianceDocuments._id, _id)).get()!;
  emitToKiln(input.kilnId, "compliance:update", doc);
  return doc;
}

export async function listComplianceDocuments(kilnId: string) {
  return db.select().from(complianceDocuments).where(eq(complianceDocuments.kilnId, kilnId)).orderBy(asc(complianceDocuments.expiryDate)).all();
}

// Surfaced as a dashboard warning — a lapsed PCB consent or royalty
// license can get the kiln fined or sealed with no other notice, so this
// is checked proactively rather than left for the owner to remember.
export async function listExpiringSoon(kilnId: string, withinDays = EXPIRY_WARNING_DAYS) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + withinDays);

  const docs = await db.select().from(complianceDocuments).where(and(eq(complianceDocuments.kilnId, kilnId), lte(complianceDocuments.expiryDate, cutoff))).orderBy(asc(complianceDocuments.expiryDate)).all();
  return docs.map((doc) => ({
    ...doc,
    expired: doc.expiryDate!.getTime() < Date.now(),
  }));
}
