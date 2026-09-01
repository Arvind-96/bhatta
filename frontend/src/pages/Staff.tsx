import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { avatarToneClass, initialOf } from "@/lib/avatarTone";
import { api } from "@/lib/api";
import { StaffDetailPage } from "@/components/staff/StaffDetailPage";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { usePersonTypeMeta } from "@/components/people/personTypes";
import type { Person, PersonType } from "@/types";

interface StaffMember {
  person: Person;
  balance: number;
}

function StaffCard({ member, onOpen }: { member: StaffMember; onOpen: () => void }) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const { person, balance } = member;
  return (
    <Card>
      <button className="flex w-full items-start gap-3 text-left" onClick={onOpen}>
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
            avatarToneClass(person._id)
          )}
        >
          {initialOf(person.name)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-ink-primary hover:underline">{person.name}</p>
          <p className="truncate text-sm text-ink-muted">
            {person.designation || personTypeMeta[person.type].label}
            {person.monthlySalary ? ` ${t("staff.perMonth", { amount: person.monthlySalary.toLocaleString("en-IN") })}` : ""}
          </p>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm text-ink-muted">{person.phone ?? "—"}</span>
        <span className={`text-xs font-medium tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
          {balance === 0
            ? t("staff.settled")
            : t(balance >= 0 ? "staff.dueAmount" : "staff.advanceAmount", { amount: Math.abs(balance).toLocaleString("en-IN") })}
        </span>
      </div>
    </Card>
  );
}

function StaffSection({
  title,
  members,
  onOpen,
  onAdd,
}: {
  title: string;
  members: StaffMember[];
  onOpen: (id: string) => void;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { page, setPage, pageCount, pageItems: pagedMembers, total } = usePagination(members, 9);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">
          {title} ({members.length})
        </h3>
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {t("common.add")}
        </Button>
      </div>
      {members.length === 0 ? (
        <Card>
          <p className="py-6 text-center text-sm text-ink-muted">{t("common.noneAddedYet")}</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedMembers.map((m) => (
              <StaffCard key={m.person._id} member={m} onOpen={() => onOpen(m.person._id)} />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={9} />
        </>
      )}
    </div>
  );
}

export function Staff() {
  const { t } = useTranslation();
  const [munims, setMunims] = useState<StaffMember[]>([]);
  const [chowkidars, setChowkidars] = useState<StaffMember[]>([]);
  const [officeHelpers, setOfficeHelpers] = useState<StaffMember[]>([]);
  const [drivers, setDrivers] = useState<StaffMember[]>([]);
  const [openStaffId, setOpenStaffId] = useState<string | null>(null);
  const [addType, setAddType] = useState<PersonType | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function withBalance(people: Person[]): Promise<StaffMember[]> {
    const details = await Promise.all(people.map((p) => api.people.get(p._id)));
    return details.map((d) => ({ person: d.person, balance: d.balance }));
  }

  async function refresh() {
    const [munimList, chowkidarList, helperList, driverList] = await Promise.all([
      api.people.list("MUNIM"),
      api.people.list("CHOWKIDAR"),
      api.people.list("HELPER"),
      api.people.list("DRIVER"),
    ]);
    const [munimMembers, chowkidarMembers, helperMembers, driverMembers] = await Promise.all([
      withBalance(munimList),
      withBalance(chowkidarList),
      withBalance(helperList.filter((h) => h.isOfficeStaff)),
      // Every Driver, not just office-flagged ones — this absorbs what the
      // now-removed People > Other tab's Driver filter used to show, so
      // every driver profile stays reachable from somewhere.
      withBalance(driverList),
    ]);
    setMunims(munimMembers);
    setChowkidars(chowkidarMembers);
    setOfficeHelpers(helperMembers);
    setDrivers(driverMembers);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  if (openStaffId) {
    return <StaffDetailPage staffId={openStaffId} onBack={() => setOpenStaffId(null)} />;
  }

  const totalOnRoster = munims.length + chowkidars.length + officeHelpers.length + drivers.length;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("staff.adminTitle")}</CardTitle>
          <span className="text-sm text-ink-muted">{t("staff.adminSubtitle")}</span>
        </CardHeader>
        <p className="text-3xl font-semibold tabular-nums text-ink-primary">{totalOnRoster}</p>
        <p className="text-sm text-ink-muted">{t("staff.totalOnRoster")}</p>
      </Card>

      <StaffSection title={t("staff.munim")} members={munims} onOpen={setOpenStaffId} onAdd={() => setAddType("MUNIM")} />
      <StaffSection title={t("staff.helperOffice")} members={officeHelpers} onOpen={setOpenStaffId} onAdd={() => setAddType("HELPER")} />
      <StaffSection title={t("staff.chowkidar")} members={chowkidars} onOpen={setOpenStaffId} onAdd={() => setAddType("CHOWKIDAR")} />
      <StaffSection title={t("staff.driverStaff")} members={drivers} onOpen={setOpenStaffId} onAdd={() => setAddType("DRIVER")} />

      {addType && (
        <AddPersonModal
          defaultType={addType}
          defaultIsOfficeStaff={addType === "HELPER" || addType === "DRIVER"}
          onClose={() => setAddType(null)}
          onCreated={refresh}
        />
      )}
    </div>
  );
}
