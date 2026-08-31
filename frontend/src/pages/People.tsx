import { useEffect, useState } from "react";
import { ChevronRight, Handshake, IndianRupee, MapPinned, Phone, Plus, Truck, Users } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FilterChips } from "@/components/ui/filter-chips";
import { SegmentedTabs } from "@/components/ui/segmented-tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { cn, formatINR } from "@/lib/utils";
import { avatarToneSolidClass, initialOf } from "@/lib/avatarTone";
import { api } from "@/lib/api";
import { useWorkTypeLabels } from "@/components/people/personTypes";
import { LedgerModal } from "@/components/people/LedgerModal";
import type { Person, PersonBalanceEntry, WorkType } from "@/types";
import { AddThekedarModal } from "@/components/people/AddThekedarModal";
import { AddLabourModal } from "@/components/people/AddLabourModal";
import { AddLandownerModal } from "@/components/people/AddLandownerModal";
import { AddSandContractorModal } from "@/components/people/AddSandContractorModal";
import { AddLandLeaseModal } from "@/components/landLease/AddLandLeaseModal";
import { LabourDetailPage } from "@/components/people/LabourDetailPage";
import { ThekedarDetailPage } from "@/components/people/ThekedarDetailPage";
import { LandownerDetailPage } from "@/components/people/LandownerDetailPage";
import { SandContractorDetailPage } from "@/components/people/SandContractorDetailPage";
import { LandLeaseDetailPage } from "@/components/landLease/LandLeaseDetailPage";
import { Staff } from "@/pages/Staff";
import { useTranslation } from "@/hooks/useTranslation";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";

// One shared bulk fetch backing every tab's second stat tile ("Due" /
// "Advance") — one request for every person's ledger balance in the kiln
// (personLedgerBalances on the backend), rather than an N+1 per-card
// lookup. Re-fetched whenever a tab mounts or a ledger entry posts
// anywhere, same "just refetch, don't patch in place" convention every
// other list on this page already follows.
function usePersonBalances() {
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const activeKilnId = useAuthStore((s) => s.activeKilnId);

  async function refresh() {
    const rows = await api.people.balances();
    setBalances(new Map(rows.map((r: PersonBalanceEntry) => [r.person.id, r.balance])));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("ledger:update", () => refresh());

  return balances;
}

type PeopleTab = "labour" | "thekedar" | "staff" | "landowner" | "sandContractor" | "landLease";

// A single reusable person card for every People-page tab (Labour,
// Thekedar, Landowner, Sand Contractor, Land Lease): a role-coded avatar
// with a live status dot, two headline stat tiles (one domain-specific,
// one their live ledger balance), and a row of one-tap actions — call,
// open their ledger, or open their full profile — so the admin rarely
// needs to drill into the detail page just to check a number or place a
// call. Mirrors the reference design system's People Page card exactly.
function PersonCard({
  person,
  subtitle,
  stat,
  balance,
  onOpen,
  onOpenLedger,
}: {
  person: Person;
  subtitle: string;
  stat: { value: string | number; label: string };
  balance?: number;
  onOpen: () => void;
  onOpenLedger: () => void;
}) {
  const { t } = useTranslation();
  const active = person.status !== "ABSCONDED";
  const hasBalance = balance !== undefined;
  const balanceTone = !hasBalance ? "" : balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good";
  const balanceWord = !hasBalance ? "" : balance > 0 ? t("people.due") : balance < 0 ? t("people.advance") : t("people.settled");

  return (
    <Card className="group flex flex-col gap-3">
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
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold text-ink-primary group-hover:underline">{person.name}</p>
            {!active && <Badge variant="critical">{t("people.absconded")}</Badge>}
          </div>
          <p className="truncate text-sm text-ink-muted">{subtitle}</p>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:text-series-1" />
      </button>

      <div className="flex gap-2">
        <div className="flex-1 rounded-xl bg-ink-primary/5 px-2.5 py-2">
          <p className="truncate text-sm font-extrabold tabular-nums text-ink-primary">{stat.value}</p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink-muted">{stat.label}</p>
        </div>
        <div className="flex-1 rounded-xl bg-ink-primary/5 px-2.5 py-2">
          <p className={cn("truncate text-sm font-extrabold tabular-nums", balanceTone || "text-ink-primary")}>
            {hasBalance ? `₹${formatINR(Math.abs(balance!))}` : "—"}
          </p>
          <p className="truncate text-[10px] font-bold uppercase tracking-wide text-ink-muted">{balanceWord || t("people.due")}</p>
        </div>
      </div>

      <div className="flex gap-2">
        <a
          href={person.phone ? `tel:${person.phone}` : undefined}
          aria-disabled={!person.phone}
          onClick={(e) => {
            if (!person.phone) e.preventDefault();
          }}
          className={cn(
            "p-icon-btn flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-ink-secondary transition-all",
            person.phone ? "hover:-translate-y-0.5 hover:shadow-glow-1" : "cursor-not-allowed opacity-40"
          )}
          aria-label={t("people.callPerson", { name: person.name })}
        >
          <Phone className="h-[15px] w-[15px]" />
        </a>
        <button
          type="button"
          onClick={onOpenLedger}
          className="p-icon-btn flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-ink-secondary transition-all hover:-translate-y-0.5 hover:shadow-glow-1"
          aria-label={t("people.openLedgerFor", { name: person.name })}
        >
          <IndianRupee className="h-[15px] w-[15px]" />
        </button>
        <button
          type="button"
          onClick={onOpen}
          className="p-icon-btn pf ml-auto flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-border bg-surface text-ink-secondary transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_16px_-4px_var(--neon-glow)]"
          aria-label={t("people.viewProfileFor", { name: person.name })}
        >
          <ChevronRight className="h-[15px] w-[15px]" />
        </button>
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

function payStat(p: Person, t: (key: string, params?: Record<string, string | number>) => string): { value: string; label: string } {
  if (p.payType === "PER_THOUSAND") {
    const rate = p.ratePerThousand ?? p.commissionPerThousand;
    return rate ? { value: `₹${rate}`, label: t("people.rateStatLabel") } : { value: "—", label: t("people.rateNotSetStat") };
  }
  if (p.payType === "MONTHLY") {
    return p.monthlySalary ? { value: `₹${formatINR(p.monthlySalary)}`, label: t("people.perMonthStatLabel") } : { value: "—", label: t("people.rateNotSetStat") };
  }
  return { value: "—", label: t("people.rateNotSetStat") };
}

function LabourTab({ onOpenLabour }: { onOpenLabour: (id: string) => void }) {
  const [labourers, setLabourers] = useState<Person[]>([]);
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [workTypeFilter, setWorkTypeFilter] = useState<"" | WorkType>("");
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const balances = usePersonBalances();
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
                  stat={payStat(l, t)}
                  balance={balances.get(l._id)}
                  onOpen={() => onOpenLabour(l._id)}
                  onOpenLedger={() => setLedgerFor(l)}
                />
              );
            })}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddLabourModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function ThekedarTab({ onOpenThekedar }: { onOpenThekedar: (id: string) => void }) {
  const [contractors, setContractors] = useState<Person[]>([]);
  const [labourCounts, setLabourCounts] = useState<Map<string, number>>(new Map());
  const [workTypesByContractor, setWorkTypesByContractor] = useState<Map<string, Set<WorkType>>>(new Map());
  const [showAdd, setShowAdd] = useState(false);
  const [workTypeFilter, setWorkTypeFilter] = useState<"" | WorkType>("");
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const balances = usePersonBalances();
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
                stat={{ value: labourCounts.get(c._id) ?? 0, label: t("people.labourCountStatLabel") }}
                balance={balances.get(c._id)}
                onOpen={() => onOpenThekedar(c._id)}
                onOpenLedger={() => setLedgerFor(c)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddThekedarModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function LandownerTab({ onOpenLandowner }: { onOpenLandowner: (id: string) => void }) {
  const [landowners, setLandowners] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const balances = usePersonBalances();
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
                stat={{ value: l.khetArea ? `${l.khetArea}` : "—", label: l.khetAreaUnit ? l.khetAreaUnit : t("people.areaStatLabel") }}
                balance={balances.get(l._id)}
                onOpen={() => onOpenLandowner(l._id)}
                onOpenLedger={() => setLedgerFor(l)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddLandownerModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function LandLeaseTab({ onOpenLandLease }: { onOpenLandLease: (id: string) => void }) {
  const [landLeases, setLandLeases] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const balances = usePersonBalances();
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setLandLeases(await api.people.list("LAND_LEASE"));
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("person:update", () => refresh());

  const { page, setPage, pageCount, pageItems: pagedLandLeases, total } = usePagination(landLeases, 12);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-series-3/15 text-series-3">
            <MapPinned className="h-4 w-4" />
          </span>
          <h3 className="font-display text-base font-bold text-ink-primary">{t("people.landLease")}</h3>
          <Badge variant="neutral">{landLeases.length}</Badge>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> {t("people.addLandLease")}
        </Button>
      </div>

      {landLeases.length === 0 ? (
        <Card>
          <EmptyState icon={MapPinned} title={t("people.noLandLeaseYet")} />
        </Card>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            {pagedLandLeases.map((l) => (
              <PersonCard
                key={l._id}
                person={l}
                subtitle={[
                  l.landLeaseSerial ? `${t("people.landLease")} - ${l.landLeaseSerial}` : null,
                  l.khetLocation || (l.khetArea ? `${l.khetArea} ${t("people.unitBigha")}` : null),
                ]
                  .filter(Boolean)
                  .join(" · ") || "—"}
                stat={{ value: l.khetArea ? `${l.khetArea}` : "—", label: t("people.unitBigha") }}
                balance={balances.get(l._id)}
                onOpen={() => onOpenLandLease(l._id)}
                onOpenLedger={() => setLedgerFor(l)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddLandLeaseModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

function SandContractorTab({ onOpenSandContractor }: { onOpenSandContractor: (id: string) => void }) {
  const [contractors, setContractors] = useState<Person[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [ledgerFor, setLedgerFor] = useState<Person | null>(null);
  const balances = usePersonBalances();
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
                stat={{ value: c.sandContractorSerial ?? "—", label: t("people.serialStatLabel") }}
                balance={balances.get(c._id)}
                onOpen={() => onOpenSandContractor(c._id)}
                onOpenLedger={() => setLedgerFor(c)}
              />
            ))}
          </div>
          <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={12} />
        </>
      )}
      {showAdd && <AddSandContractorModal onClose={() => setShowAdd(false)} onCreated={refresh} />}
      {ledgerFor && <LedgerModal person={ledgerFor} onClose={() => setLedgerFor(null)} />}
    </div>
  );
}

export function People() {
  const [tab, setTab] = useState<PeopleTab>("labour");
  const [openLabourId, setOpenLabourId] = useState<string | null>(null);
  const [openThekedarId, setOpenThekedarId] = useState<string | null>(null);
  const [openLandownerId, setOpenLandownerId] = useState<string | null>(null);
  const [openSandContractorId, setOpenSandContractorId] = useState<string | null>(null);
  const [openLandLeaseId, setOpenLandLeaseId] = useState<string | null>(null);
  const { t } = useTranslation();

  if (openLandownerId) {
    return <LandownerDetailPage landownerId={openLandownerId} onBack={() => setOpenLandownerId(null)} />;
  }

  if (openSandContractorId) {
    return <SandContractorDetailPage sandContractorId={openSandContractorId} onBack={() => setOpenSandContractorId(null)} />;
  }

  if (openLandLeaseId) {
    return <LandLeaseDetailPage landLeaseId={openLandLeaseId} onBack={() => setOpenLandLeaseId(null)} />;
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
    { value: "landLease", label: t("people.landLease") },
  ];

  return (
    <div className="space-y-4">
      <SegmentedTabs options={tabs} value={tab} onChange={setTab} />

      {tab === "labour" && <LabourTab onOpenLabour={setOpenLabourId} />}
      {tab === "thekedar" && <ThekedarTab onOpenThekedar={setOpenThekedarId} />}
      {tab === "staff" && <Staff />}
      {tab === "landowner" && <LandownerTab onOpenLandowner={setOpenLandownerId} />}
      {tab === "sandContractor" && <SandContractorTab onOpenSandContractor={setOpenSandContractorId} />}
      {tab === "landLease" && <LandLeaseTab onOpenLandLease={setOpenLandLeaseId} />}
    </div>
  );
}
