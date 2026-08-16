import { FormEvent, useEffect, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { LedgerModal } from "@/components/people/LedgerModal";
import { useTranslation } from "@/hooks/useTranslation";
import type { LedgerEntry, Person } from "@/types";
import { formatINR } from "@/lib/utils";
import { usePersonTypeMeta } from "@/components/people/personTypes";
import { AttendanceCalendar } from "./AttendanceCalendar";
import { SalarySlipHistory } from "./SalarySlipHistory";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface StaffDetailPageProps {
  staffId: string;
  onBack: () => void;
}

const ADVANCE_CATEGORY_KEYS: Record<string, string> = {
  ADVANCE: "staff.advanceCategoryAdvance",
  KHARCHI: "staff.advanceCategoryKharchi",
  MEDICAL: "staff.advanceCategoryMedical",
  FESTIVAL: "staff.advanceCategoryFestival",
  OTHER: "staff.advanceCategoryOther",
};

// Dedicated profile page for permanent bhatta admin/support staff (Main
// Munim, Junior Munims, office Helpers, Chowkidar, Driver) — personal
// details, editable monthly salary + designation, and their full financial
// ledger. No shift/attendance/output tracking here — that's specific to
// the production-side roles (Fitter, Bharai/Nikasi gangs), not office staff.
export function StaffDetailPage({ staffId, onBack }: StaffDetailPageProps) {
  const { t } = useTranslation();
  const personTypeMeta = usePersonTypeMeta();
  const [staff, setStaff] = useState<Person | null>(null);
  const [balance, setBalance] = useState(0);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);
  const [salaryInput, setSalaryInput] = useState("");
  const [designationInput, setDesignationInput] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [saving, setSaving] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [ledgerOpen, setLedgerOpen] = useState(false);

  async function refresh() {
    const [detail, ledger] = await Promise.all([api.people.get(staffId), api.people.listLedger(staffId)]);
    setStaff(detail.person);
    setBalance(detail.balance);
    setLedgerEntries(ledger);
    setSalaryInput(detail.person.monthlySalary ? String(detail.person.monthlySalary) : "");
    setDesignationInput(detail.person.designation ?? "");
    setName(detail.person.name);
    setPhone(detail.person.phone ?? "");
    setAddress(detail.person.address ?? "");
    setIdNumber(detail.person.idNumber ?? "");
  }

  useEffect(() => {
    refresh().catch(console.error);
  }, [staffId]);

  useKilnEvent("ledger:update", () => refresh());
  useKilnEvent("person:update", () => refresh());

  async function saveContactInfo(e: FormEvent) {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.people.update(staffId, {
        name: name.trim(),
        phone: phone || undefined,
        address: address || undefined,
        idNumber: idNumber || undefined,
      });
      await refresh();
    } finally {
      setSavingProfile(false);
    }
  }

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.people.update(staffId, {
        monthlySalary: salaryInput ? Number(salaryInput) : undefined,
        designation: designationInput || undefined,
      });
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  // Soft delete — active:false drops them from the Staff page (and every
  // other people list), but their ledger history stays intact.
  async function deleteProfile() {
    if (!staff) return;
    if (!confirm(t("staff.confirmDeleteProfile", { name: staff.name }))) return;
    await api.people.update(staffId, { active: false });
    onBack();
  }

  const backButton = (
    <button onClick={onBack} className="mb-3 flex items-center gap-1.5 text-sm text-ink-secondary hover:text-ink-primary">
      <ArrowLeft className="h-4 w-4" /> {t("staff.backToStaff")}
    </button>
  );

  if (!staff) {
    return (
      <div>
        {backButton}
        <Card>
          <p className="py-8 text-center text-sm text-ink-muted">{t("common.loading")}</p>
        </Card>
      </div>
    );
  }

  const totalEarnings = ledgerEntries
    .filter((e) => e.direction === "DUE" && (e.category === "SALARY" || e.category === "WAGE" || !e.category))
    .reduce((sum, e) => sum + e.amount, 0);

  const advancesByCategory = new Map<string, number>();
  for (const e of ledgerEntries) {
    if (e.direction !== "PAID") continue;
    const key = e.category ?? "OTHER";
    advancesByCategory.set(key, (advancesByCategory.get(key) ?? 0) + e.amount);
  }
  const totalAdvancesGiven = Array.from(advancesByCategory.values()).reduce((sum, v) => sum + v, 0);

  return (
    <div>
      {backButton}

      <div className="mb-4 flex items-start justify-between">
        <div>
          <h3 className="text-lg font-semibold text-ink-primary">{staff.name}</h3>
          <p className="text-sm text-ink-muted">
            {staff.designation || personTypeMeta[staff.type].label}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setLedgerOpen(true)}>
            {t("staff.advanceSalaryButton")}
          </Button>
          <button
            onClick={deleteProfile}
            className="flex items-center gap-1 rounded-lg border border-status-critical/30 bg-status-critical/5 px-3 py-1.5 text-xs font-medium text-status-critical hover:bg-status-critical/10"
          >
            <Trash2 className="h-3.5 w-3.5" /> {t("common.delete")}
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.staffProfile")}</h4>
          <form onSubmit={saveContactInfo} className="flex flex-col gap-2">
            <input required placeholder={t("common.name")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
            <input placeholder={t("common.phone")} value={phone} onChange={(e) => setPhone(e.target.value)} className={inputClass} />
            <input placeholder={t("staff.address")} value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} />
            <input
              placeholder={t("staff.aadharIdNumber")}
              value={idNumber}
              onChange={(e) => setIdNumber(e.target.value)}
              className={inputClass}
            />
            <Button type="submit" size="sm" disabled={savingProfile}>
              {t("staff.saveProfile")}
            </Button>
          </form>
        </Card>

        <Card>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.designationSalary")}</h4>
          <form onSubmit={saveProfile} className="flex flex-col gap-2">
            <input
              placeholder={t("staff.designationPlaceholder")}
              value={designationInput}
              onChange={(e) => setDesignationInput(e.target.value)}
              className={inputClass}
            />
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-sm text-ink-muted">{t("staff.monthlySalary")}</label>
                <input
                  type="number"
                  value={salaryInput}
                  onChange={(e) => setSalaryInput(e.target.value)}
                  placeholder={t("staff.salaryExample")}
                  className={inputClass}
                />
              </div>
              <Button type="submit" size="sm" disabled={saving}>
                {t("common.save")}
              </Button>
            </div>
          </form>
        </Card>

        <Card className="lg:col-span-2">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("staff.financialLedger")}</h4>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalEarnings)}</p>
              <p className="text-sm text-ink-muted">{t("staff.totalEarnings")}</p>
            </div>
            <div>
              <p className="text-xl font-semibold tabular-nums text-ink-primary">₹{formatINR(totalAdvancesGiven)}</p>
              <p className="text-sm text-ink-muted">{t("staff.advancesKharchiExpenses")}</p>
            </div>
            <div>
              <p className={`text-xl font-semibold tabular-nums ${balance > 0 ? "text-status-critical" : balance < 0 ? "text-status-warning" : "text-status-good"}`}>
                ₹{formatINR(Math.abs(balance))}
              </p>
              <p className="text-sm text-ink-muted">{balance >= 0 ? t("staff.netDue") : t("staff.advanceOutstanding")}</p>
            </div>
          </div>
          {advancesByCategory.size > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-border pt-3">
              {Array.from(advancesByCategory.entries()).map(([category, amount]) => (
                <span key={category} className="rounded-full border border-border bg-ink-primary/5 px-2.5 py-1 text-xs text-ink-secondary">
                  {ADVANCE_CATEGORY_KEYS[category] ? t(ADVANCE_CATEGORY_KEYS[category]) : category}: ₹{formatINR(amount)}
                </span>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <AttendanceCalendar personId={staffId} />
        <SalarySlipHistory personId={staffId} />
      </div>

      {ledgerOpen && <LedgerModal person={staff} onClose={() => setLedgerOpen(false)} />}
    </div>
  );
}
