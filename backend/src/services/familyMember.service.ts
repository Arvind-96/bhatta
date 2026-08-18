import { randomUUID } from "crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db/client";
import { familyMembers, people } from "../db/schema";
import { createPerson, assertPersonOfType, WorkType } from "./person.service";
import { emitToKiln } from "../config/socket";

export interface CreateFamilyMemberInput {
  kilnId: string;
  headPersonId: string;
  name: string;
  relation: string;
  age?: number;
  sex?: "MALE" | "FEMALE" | "OTHER";
  isWorking?: boolean;
  notes?: string;
}

async function withWorker(member: typeof familyMembers.$inferSelect) {
  if (!member.workerId) return member;
  const worker = (await db.select({ _id: people._id, name: people.name, status: people.status }).from(people).where(eq(people._id, member.workerId)))[0];
  return { ...member, workerId: worker ?? member.workerId };
}

// Declaring a family member who also works auto-creates a real,
// independent Person record for them (type WORKER, same thekedar as the
// head by default) and links it both ways: FamilyMember.workerId points
// at the new Person, and the new Person's familyHeadId points back at the
// head — so either profile can find the rest of the family with one
// lookup. A non-working member (e.g. a young child) stays informational
// only, no Person record.
export async function createFamilyMember(input: CreateFamilyMemberInput) {
  const head = await assertPersonOfType(input.kilnId, input.headPersonId, ["WORKER", "HELPER"]);

  let workerId: string | undefined;
  if (input.isWorking) {
    const worker = await createPerson({
      kilnId: input.kilnId,
      type: head.type as "WORKER" | "HELPER",
      name: input.name,
      age: input.age,
      sex: input.sex,
      contractorId: head.contractorId ?? undefined,
      workType: head.workType as WorkType | undefined,
      familyHeadId: input.headPersonId,
    });
    workerId = worker._id;
  }

  const _id = randomUUID();
  await db.insert(familyMembers)
    .values({
      _id,
      kilnId: input.kilnId,
      headPersonId: input.headPersonId,
      name: input.name,
      relation: input.relation as any,
      age: input.age,
      sex: input.sex,
      isWorking: !!input.isWorking,
      workerId,
      notes: input.notes,
    });

  const member = (await db.select().from(familyMembers).where(eq(familyMembers._id, _id)))[0]!;
  emitToKiln(input.kilnId, "familyMember:update", member);
  if (workerId) emitToKiln(input.kilnId, "person:update", { _id: workerId });
  return member;
}

export interface UpdateFamilyMemberInput {
  name?: string;
  relation?: string;
  age?: number;
  sex?: "MALE" | "FEMALE" | "OTHER";
  isWorking?: boolean;
  notes?: string;
}

// If isWorking flips from false to true and there's no linked worker yet,
// this creates one now (same as at creation time). Flipping true→false
// deliberately does NOT remove/deactivate the existing worker record —
// once someone has real work/ledger history, that's a separate decision
// for the admin to make from their own profile (the existing Delete
// button there), not an automatic side effect of a checkbox.
export async function updateFamilyMember(kilnId: string, memberId: string, input: UpdateFamilyMemberInput) {
  const existing = (await db.select().from(familyMembers).where(and(eq(familyMembers._id, memberId), eq(familyMembers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Family member not found in this kiln");

  let workerId = existing.workerId ?? undefined;
  if (input.isWorking && !workerId) {
    const head = (await db.select().from(people).where(and(eq(people._id, existing.headPersonId), eq(people.kilnId, kilnId))))[0];
    if (!head) throw new Error("Head person not found in this kiln");
    const worker = await createPerson({
      kilnId,
      type: head.type as "WORKER" | "HELPER",
      name: input.name ?? existing.name,
      age: input.age ?? existing.age ?? undefined,
      sex: input.sex ?? (existing.sex as "MALE" | "FEMALE" | "OTHER" | undefined),
      contractorId: head.contractorId ?? undefined,
      workType: head.workType as WorkType | undefined,
      familyHeadId: existing.headPersonId,
    });
    workerId = worker._id;
  }

  await db.update(familyMembers).set({ ...input, relation: input.relation as any, workerId }).where(eq(familyMembers._id, memberId));
  const updated = (await db.select().from(familyMembers).where(eq(familyMembers._id, memberId)))[0]!;

  emitToKiln(kilnId, "familyMember:update", updated);
  if (input.isWorking && workerId && workerId !== existing.workerId) {
    emitToKiln(kilnId, "person:update", { _id: workerId });
  }
  return updated;
}

export async function deleteFamilyMember(kilnId: string, memberId: string) {
  const existing = (await db.select().from(familyMembers).where(and(eq(familyMembers._id, memberId), eq(familyMembers.kilnId, kilnId))))[0];
  if (!existing) throw new Error("Family member not found in this kiln");
  await db.delete(familyMembers).where(eq(familyMembers._id, memberId));
  emitToKiln(kilnId, "familyMember:update", existing);
  return existing;
}

export async function listFamilyMembers(kilnId: string, headPersonId: string) {
  const rows = await db
    .select()
    .from(familyMembers)
    .where(and(eq(familyMembers.kilnId, kilnId), eq(familyMembers.headPersonId, headPersonId)))
    .orderBy(asc(familyMembers.createdAt));
  return Promise.all(rows.map(withWorker));
}

// Resolves "the family" for ANY person — whether they're the head
// themselves, or one of the auto-created working members. Either way you
// land on the same head + the same full member list, so opening any one
// family member's profile shows the rest.
export async function getFamilyForPerson(kilnId: string, personId: string) {
  const person = (await db.select().from(people).where(and(eq(people._id, personId), eq(people.kilnId, kilnId))))[0];
  if (!person) throw new Error("Person not found in this kiln");

  const headPersonId = person.familyHeadId ?? person._id;
  const head = (await db.select().from(people).where(and(eq(people._id, headPersonId), eq(people.kilnId, kilnId))))[0];
  const members = await listFamilyMembers(kilnId, headPersonId);

  return { head, members };
}
