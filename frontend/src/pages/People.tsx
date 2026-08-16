import { useEffect, useState } from "react";
import { Handshake, Plus, ScanFace, UserPlus, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { avatarToneClass, initialOf } from "@/lib/avatarTone";
import { api } from "@/lib/api";
import { useWorkTypeLabels } from "@/components/people/personTypes";
import type { Person, PersonType, WorkType } from "@/types";
import { usePersonTypeMeta, PERSON_TYPES } from "@/components/people/personTypes";
import { AddPersonModal } from "@/components/people/AddPersonModal";
import { AddThekedarModal } from "@/components/people/AddThekedarModal";
import { AddLabourModal } from "@/components/people/AddLabourModal";
import { LedgerModal } from "@/components/people/LedgerModal";
import { EnrollFaceModal } from "@/components/people/EnrollFaceModal";
import { LabourDetailPage } from "@/components/people/LabourDetailPage";
import { ThekedarDetailPage } from "@/components/people/ThekedarDetailPage";
import { LandownerDetailPage } from "@/components/people/LandownerDetailPage";
import { Staff } from "@/pages/Staff";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";

// Types with their own dedicated Labour/Thekedar/Staff treatment below —
// excluded from the "Other" tab's chip filter so the same person isn't
// reachable two different ways.
const OTHER_TAB_TYPES = PERSON_TYPES.filter(
  (t) => !["WORKER", "HELPER", "LABOUR_CONTRACTOR", "MUNIM", "CHOWKIDAR"].includes(t)
);

type PeopleTab = "labour" | "thekedar" | "staff" | "other";

function PersonCard({
  person,
  subtitle,
  balanceLabel,
  onOpen,
}: {
  person: Person;
  subtitle: string;
  balanceLabel?: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
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
          <p className="truncate text-sm text-ink-muted">{subtitle}</p>
        </div>
      </button>
      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <span className="text-sm text-ink-muted">{person.phone ?? "—"}</span>
        <div className="flex items-center gap-1.5">
          {balanceLabel && <span className="text-xs font-medium text-ink-secondary">{balanceLabel}</span>}
          <Badge variant={person.status === "ABSCONDED" ? "critical" : "good"}>
            {person.status === "ABSCONDED" ? t("people.absconded") : t("common.active")}
          </Badge>
        </div>
      </div>
    </Card>
  );
}

function payLabel(p: Person, t: (key: string, params?: Record<string, string | number>) => string) {
  if (p.payType === "PER_THOUSAND") {
    return p.ratePerThousand
      ? t("people.ratePerThousandBricks", { amount: p.ratePerThousand })
      : p.commissionPerThousand
      ? t("people.ratePerThousandBricks", { amount: p.commissionPerThousand })
      : t("people.perThousandBricksShort");
  }
  if (p.payType === "MONTHLY") {
    return p.monthlySalary
      ? t("people.ratePerMonth", { amount: p.monthlySalary.toLocaleString("en-IN") })
      : t("people.monthlyShort");
  }
  return t("people.payTypeNotSet");
}

function LabourTab({ onOpenLabour }: { onOpenLabour: (id: string) => void }) {
  const [labourers, setLabourers] = useState<Person[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [workTypeFilter, setWorkTypeFilter] = useState<"" | WorkType>("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();

  async function refresh() {
    const [workers, helpers, contractorList] = await Promise.all([
      api.people.list("WORKER"),
      api.people.list("HELPER"),
      api.people.list("LABOUR_CONTRACTOR"),
    ]);
    setLabourers([...workers, ...helpers].filter((p) => !p.isOfficeStaff));
    setContractors(contractorList);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  const contractorNameById = new Map(contractors.map((c) => [c._id, c.name]));
  const filteredLabourers = workTypeFilter ? labourers.filter((l) => l.workType === workTypeFilter) : labourers;
  const { page, setPage, pageCount, pageItems: pagedLabourers, total } = usePagination(filteredLabourers, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-1/15 text-series-1">
            <Users className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-bold text-ink-primary">{t("people.labour")}</h3>
          <Badge variant="neutral">{filteredLabourers.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("people.addLabour")}
        </Button>
      </div>

      <FilterChips
        options={[{ value: "" as const, label: t("common.all") }, ...(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => ({ value, label }))]}
        value={workTypeFilter}
        onChange={setWorkTypeFilter}
      />

      {filteredLabourers.length === 0 ? (
        <Card>
          <EmptyState
            icon={Users}
            title={workTypeFilter ? t("people.noLabourForWorkType") : t("people.noLabourYet")}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedLabourers.map((l) => {
              const contractorName = l.contractorId ? contractorNameById.get(l.contractorId) : undefined;
              return (
                <PersonCard
                  key={l._id}
                  person={l}
                  subtitle={`${l.type === "WORKER" ? t("people.roleWorker") : t("people.roleHelper")} · ${payLabel(l, t)}${
                    contractorName ? t("people.underThekedar", { name: contractorName }) : ""
                  }`}
                  onOpen={() => onOpenLabour(l._id)}
                />
              );
            })}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddLabourModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
    </div>
  );
}

function ThekedarTab({ onOpenThekedar }: { onOpenThekedar: (id: string) => void }) {
  const [contractors, setContractors] = useState<Person[]>([]);
  const [labourCounts, setLabourCounts] = useState<Map<string, number>>(new Map());
  const [workTypesByContractor, setWorkTypesByContractor] = useState<Map<string, Set<WorkType>>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [workTypeFilter, setWorkTypeFilter] = useState<"" | WorkType>("");
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();
  const workTypeLabels = useWorkTypeLabels();

  async function refresh() {
    const [contractorList, workers, helpers] = await Promise.all([
      api.people.list("LABOUR_CONTRACTOR"),
      api.people.list("WORKER"),
      api.people.list("HELPER"),
    ]);
    setContractors(contractorList);
    const counts = new Map<string, number>();
    const workTypes = new Map<string, Set<WorkType>>();
    for (const p of [...workers, ...helpers]) {
      if (!p.contractorId) continue;
      counts.set(p.contractorId, (counts.get(p.contractorId) ?? 0) + 1);
      if (p.workType) {
        if (!workTypes.has(p.contractorId)) workTypes.set(p.contractorId, new Set());
        workTypes.get(p.contractorId)!.add(p.workType);
      }
    }
    setLabourCounts(counts);
    setWorkTypesByContractor(workTypes);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  // Prefer the thekedar's own declared work type (set directly on their
  // profile); fall back to what's inferred from their labour's work types
  // for contractors who haven't set their own yet, so existing data still
  // filters correctly.
  const filteredContractors = workTypeFilter
    ? contractors.filter((c) => c.workType === workTypeFilter || (!c.workType && workTypesByContractor.get(c._id)?.has(workTypeFilter)))
    : contractors;
  const { page, setPage, pageCount, pageItems: pagedContractors, total } = usePagination(filteredContractors, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-2/15 text-series-2">
            <Handshake className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-bold text-ink-primary">{t("people.thekedarContractor")}</h3>
          <Badge variant="neutral">{filteredContractors.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("people.addThekedar")}
        </Button>
      </div>

      <FilterChips
        options={[{ value: "" as const, label: t("common.all") }, ...(Object.entries(workTypeLabels) as [WorkType, string][]).map(([value, label]) => ({ value, label }))]}
        value={workTypeFilter}
        onChange={setWorkTypeFilter}
      />

      {filteredContractors.length === 0 ? (
        <Card>
          <EmptyState
            icon={Handshake}
            title={workTypeFilter ? t("people.noThekedarsForWorkType") : t("people.noThekedarsYet")}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedContractors.map((c) => (
              <PersonCard
                key={c._id}
                person={c}
                subtitle={`${labourCounts.get(c._id) ?? 0} ${t("people.labour")} · ${payLabel(c, t)}${c.workType ? ` · ${workTypeLabels[c.workType]}` : ""}`}
                onOpen={() => onOpenThekedar(c._id)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddThekedarModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
    </div>
  );
}

function OtherTab({ onOpenLandowner }: { onOpenLandowner: (id: string) => void }) {
  const [filter, setFilter] = useState<PersonType | "ALL">("ALL");
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const [faceFor, setFaceFor] = useState<Person | null>(null);
  const { t: tr } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    setLoading(true);
    try {
      if (filter === "ALL") {
        const lists = await Promise.all(OTHER_TAB_TYPES.map((t) => api.people.list(t)));
        setPeople(lists.flat());
      } else {
        setPeople(await api.people.list(filter));
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [filter, activeKilnId]);

  useKilnEvent("person:update", () => refresh());
  useKilnEvent("ledger:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedPeople, total } = usePagination(people, 10);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <FilterChips
          options={[{ value: "ALL" as const, label: tr("common.all") }, ...OTHER_TAB_TYPES.map((t) => ({ value: t, label: personTypeMeta[t].label }))]}
          value={filter}
          onChange={setFilter}
        />
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" />
          {tr("people.addPerson")}
        </Button>
      </div>

      <Card>
        {loading ? (
          <p className="py-8 text-center text-sm text-ink-muted">{tr("common.loading")}</p>
        ) : people.length === 0 ? (
          <EmptyState icon={UserPlus} title={tr("people.noOneAddedYet")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-sm text-ink-muted">
                  <th className="pb-2 font-medium">{tr("common.name")}</th>
                  <th className="pb-2 font-medium">{tr("common.type")}</th>
                  <th className="pb-2 font-medium">{tr("common.phone")}</th>
                  <th className="pb-2 font-medium">{tr("common.details")}</th>
                  <th className="pb-2 font-medium">{tr("people.face")}</th>
                  <th className="pb-2 font-medium text-right">{tr("people.ledger")}</th>
                </tr>
              </thead>
              <tbody>
                {pagedPeople.map((p) => (
                  <tr key={p._id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 font-medium text-ink-primary">
                      {p.type === "LANDOWNER" ? (
                        <button onClick={() => onOpenLandowner(p._id)} className="hover:underline">
                          {p.name}
                        </button>
                      ) : (
                        p.name
                      )}
                    </td>
                    <td className="py-3">
                      <Badge variant="neutral">{personTypeMeta[p.type].label}</Badge>
                    </td>
                    <td className="py-3 text-ink-secondary">{p.phone ?? "—"}</td>
                    <td className="py-3 text-ink-secondary">
                      {p.type === "DRIVER" && (p.vehicleNumber ?? "—")}
                      {p.type === "PARTNER" && (p.profitSharePercent ? tr("people.profitShare", { percent: p.profitSharePercent }) : "—")}
                      {p.type === "LANDOWNER" &&
                        (p.khetArea ? `${p.khetArea} ${p.khetAreaUnit ?? "bigha"}` : p.khetLocation ?? "—")}
                      {p.type === "CUSTOMER" && (p.creditLimit ? tr("people.creditLimit", { amount: p.creditLimit.toLocaleString("en-IN") }) : tr("people.noLimitSet"))}
                      {p.type === "FITTER" && (p.monthlySalary ? tr("people.ratePerMonth", { amount: p.monthlySalary.toLocaleString("en-IN") }) : "—")}
                      {!["DRIVER", "PARTNER", "LANDOWNER", "CUSTOMER", "FITTER"].includes(p.type) && "—"}
                    </td>
                    <td className="py-3">
                      {personTypeMeta[p.type].hasFace ? (
                        <button
                          onClick={() => setFaceFor(p)}
                          className="flex items-center gap-1 text-sm text-ink-muted hover:text-series-1"
                        >
                          <ScanFace className="h-3.5 w-3.5" />
                          {p.faceDescriptor?.length ? tr("people.reenroll") : tr("people.enroll")}
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 text-right">
                      <button onClick={() => setLedgerFor(p)} className="text-xs font-medium text-series-1 hover:underline">
                        {tr("common.view")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
          </div>
        )}
      </Card>

      {showAdd && (
        <AddPersonModal
          defaultType={filter === "ALL" ? "DRIVER" : filter}
          onClose={() => setShowAdd(false)}
          onCreated={refresh}
        />
      )}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
      {faceFor && (
        <EnrollFaceModal
          personId={faceFor._id}
          personName={faceFor.name}
          onClose={() => setFaceFor(null)}
          onEnrolled={refresh}
        />
      )}
    </div>
  );
}

export function People() {
  const [tab, setTab] = useState<PeopleTab>("labour");
  const [openLabourId, setOpenLabourId] = useState<string | null>(null);
  const [openThekedarId, setOpenThekedarId] = useState<string | null>(null);
  const [openLandownerId, setOpenLandownerId] = useState<string | null>(null);
  const { t } = useTranslation();

  if (openLandownerId) {
    return <LandownerDetailPage landownerId={openLandownerId} onBack={() => setOpenLandownerId(null)} />;
  }

  if (openLabourId) {
    return (
      <LabourDetailPage
        labourId={openLabourId}
        onBack={() => setOpenLabourId(null)}
        onOpenThekedar={(id) => {
          setOpenLabourId(null);
          setOpenThekedarId(id);
        }}
        onOpenLabour={setOpenLabourId}
      />
    );
  }

  if (openThekedarId) {
    return (
      <ThekedarDetailPage
        thekedarId={openThekedarId}
        onBack={() => setOpenThekedarId(null)}
        onOpenLabour={(id) => {
          setOpenThekedarId(null);
          setOpenLabourId(id);
        }}
      />
    );
  }

  const tabs: { value: PeopleTab; label: string }[] = [
    { value: "labour", label: t("people.labour") },
    { value: "thekedar", label: t("people.thekedarTabLabel") },
    { value: "staff", label: t("nav.staff") },
    { value: "other", label: t("people.other") },
  ];

  return (
    <div className="space-y-4">
      <SegmentedTabs options={tabs} value={tab} onChange={setTab} />

      {tab === "labour" && <LabourTab onOpenLabour={setOpenLabourId} />}
      {tab === "thekedar" && <ThekedarTab onOpenThekedar={setOpenThekedarId} />}
      {tab === "staff" && <Staff />}
      {tab === "other" && <OtherTab onOpenLandowner={setOpenLandownerId} />}
    </div>
  );
}
