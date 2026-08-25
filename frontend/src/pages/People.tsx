import { useEffect, useState } from "react";
import { ChevronRight, Handshake, MapPinned, Phone, Plus, Truck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn } from "@/lib/utils";
import { avatarToneSolidClass, initialOf } from "@/lib/avatarTone";
import { api } from "@/lib/api";
import { useWorkTypeLabels } from "@/components/people/personTypes";
import type { Person, WorkType } from "@/types";
import { AddThekedarModal } from "@/components/people/AddThekedarModal";
import { AddLabourModal } from "@/components/people/AddLabourModal";
import { AddLandownerModal } from "@/components/people/AddLandownerModal";
import { AddSandContractorModal } from "@/components/people/AddSandContractorModal";
import { LabourDetailPage } from "@/components/people/LabourDetailPage";
import { ThekedarDetailPage } from "@/components/people/ThekedarDetailPage";
import { LandownerDetailPage } from "@/components/people/LandownerDetailPage";
import { SandContractorDetailPage } from "@/components/people/SandContractorDetailPage";
import { Staff } from "@/pages/Staff";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";

type PeopleTab = "labour" | "thekedar" | "staff" | "landowner" | "sandContractor";

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
  const active = person.status !== "ABSCONDED";
  return (
    <Card className="group">
      <button className="flex w-full items-start gap-3 text-left" onClick={onOpen}>
        <div className="relative shrink-0">
          <div
            className={cn(
              "flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-base font-bold shadow-[0_0_0_3px_var(--surface),0_0_0_4.5px_var(--neon-glow)]",
              avatarToneSolidClass(person._id)
            )}
          >
            {initialOf(person.name)}
          </div>
          <span
            className={cn(
              "absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface",
              active ? "bg-status-good" : "bg-status-critical"
            )}
            aria-hidden
          />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink-primary group-hover:underline">{person.name}</p>
          <p className="truncate text-sm text-ink-muted">{subtitle}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-series-1" />
      </button>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-border pt-3">
        <div className="flex min-w-0 items-center gap-2">
          {person.phone ? (
            <>
              <a
                href={`tel:${person.phone}`}
                onClick={(e) => e.stopPropagation()}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-series-1 text-white shadow-glow-1 transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
                aria-label={t("people.callPerson", { name: person.name })}
              >
                <Phone className="h-3.5 w-3.5" />
              </a>
              <span className="truncate text-sm text-ink-muted">{person.phone}</span>
            </>
          ) : (
            <span className="truncate text-sm text-ink-muted">—</span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
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
    // "THEKEDAR" is a separate raw person-type from "LABOUR_CONTRACTOR" in
    // the schema (a legacy naming split), but both mean the same thing to
    // the admin — merged here so a THEKEDAR-typed record (previously only
    // reachable via the now-removed "Other" tab) shows up under this tab
    // like every other contractor.
    const [contractorList, thekedarList, workers, helpers] = await Promise.all([
      api.people.list("LABOUR_CONTRACTOR"),
      api.people.list("THEKEDAR"),
      api.people.list("WORKER"),
      api.people.list("HELPER"),
    ]);
    setContractors([...contractorList, ...thekedarList]);
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

function LandownerTab({ onOpenLandowner }: { onOpenLandowner: (id: string) => void }) {
  const [landowners, setLandowners] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setLandowners(await api.people.list("LANDOWNER"));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedLandowners, total } = usePagination(landowners, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-3/15 text-series-3">
            <MapPinned className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-bold text-ink-primary">{t("people.landowner")}</h3>
          <Badge variant="neutral">{landowners.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("people.addLandowner")}
        </Button>
      </div>

      {landowners.length === 0 ? (
        <Card>
          <EmptyState icon={MapPinned} title={t("people.noLandownersYet")} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedLandowners.map((l) => (
              <PersonCard
                key={l._id}
                person={l}
                subtitle={[
                  l.landownerSerial ? `${t("people.landowner")} - ${l.landownerSerial}` : null,
                  l.khetLocation || (l.khetArea ? `${l.khetArea} ${l.khetAreaUnit ?? "bigha"}` : null),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
                onOpen={() => onOpenLandowner(l._id)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddLandownerModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
    </div>
  );
}

function SandContractorTab({ onOpenSandContractor }: { onOpenSandContractor: (id: string) => void }) {
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setContractors(await api.people.list("SAND_CONTRACTOR"));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedContractors, total } = usePagination(contractors, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-4/15 text-series-4">
            <Truck className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-bold text-ink-primary">{t("people.sandContractor")}</h3>
          <Badge variant="neutral">{contractors.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("people.addSandContractor")}
        </Button>
      </div>

      {contractors.length === 0 ? (
        <Card>
          <EmptyState icon={Truck} title={t("people.noSandContractorsYet")} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedContractors.map((c) => (
              <PersonCard
                key={c._id}
                person={c}
                subtitle={c.sandContractorSerial ? `${t("people.sandContractor")} - ${c.sandContractorSerial}` : "—"}
                onOpen={() => onOpenSandContractor(c._id)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddSandContractorModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
    </div>
  );
}

export function People() {
  const [tab, setTab] = useState<PeopleTab>("labour");
  const [openLabourId, setOpenLabourId] = useState<string | null>(null);
  const [openThekedarId, setOpenThekedarId] = useState<string | null>(null);
  const [openLandownerId, setOpenLandownerId] = useState<string | null>(null);
  const [openSandContractorId, setOpenSandContractorId] = useState<string | null>(null);
  const { t } = useTranslation();

  if (openLandownerId) {
    return <LandownerDetailPage landownerId={openLandownerId} onBack={() => setOpenLandownerId(null)} />;
  }

  if (openSandContractorId) {
    return <SandContractorDetailPage sandContractorId={openSandContractorId} onBack={() => setOpenSandContractorId(null)} />;
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
    { value: "landowner", label: t("people.landowner") },
    { value: "sandContractor", label: t("people.sandContractor") },
  ];

  return (
    <div className="space-y-4">
      <SegmentedTabs options={tabs} value={tab} onChange={setTab} />

      {tab === "labour" && <LabourTab onOpenLabour={setOpenLabourId} />}
      {tab === "thekedar" && <ThekedarTab onOpenThekedar={setOpenThekedarId} />}
      {tab === "staff" && <Staff />}
      {tab === "landowner" && <LandownerTab onOpenLandowner={setOpenLandownerId} />}
      {tab === "sandContractor" && <SandContractorTab onOpenSandContractor={setOpenSandContractorId} />}
    </div>
  );
}
