import { FormEvent, useEffect, useState } from "react";
import { Banknote, Plus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { EmptyState } from "@/components/ui/empty-state";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { formatINR, cn } from "@/lib/utils";
import type { BankAccount, BankTransaction, BankTransactionDirection, BankReconciliationSummary, BookEntry } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

function AddAccountForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [bankName, setBankName] = useState("");
  const [accountLabel, setAccountLabel] = useState("");
  const [accountNumberLast4, setAccountNumberLast4] = useState("");
  const [openingBalance, setOpeningBalance] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!bankName.trim()) return;
    setSaving(true);
    try {
      await api.bankAccounts.create({
        bankName: bankName.trim(),
        accountLabel: accountLabel.trim() || undefined,
        accountNumberLast4: accountNumberLast4.trim() || undefined,
        openingBalance: openingBalance ? Number(openingBalance) : undefined,
      });
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="max-w-md">
      <CardHeader>
        <CardTitle>{t("bankRecon.newAccount")}</CardTitle>
      </CardHeader>
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input required placeholder={t("bankRecon.bankNamePlaceholder")} value={bankName} onChange={(e) => setBankName(e.target.value)} className={inputClass} />
        <input placeholder={t("bankRecon.accountLabelPlaceholder")} value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} className={inputClass} />
        <input placeholder={t("bankRecon.last4Placeholder")} value={accountNumberLast4} onChange={(e) => setAccountNumberLast4(e.target.value)} className={inputClass} />
        <input type="number" placeholder={t("bankRecon.openingBalancePlaceholder")} value={openingBalance} onChange={(e) => setOpeningBalance(e.target.value)} className={inputClass} />
        <div className="flex gap-2">
          <Button type="submit" disabled={saving || !bankName.trim()}>
            {saving ? t("settings.savingEllipsis") : t("common.save")}
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AddTransactionForm({ bankAccountId, onClose, onSaved }: { bankAccountId: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [direction, setDirection] = useState<BankTransactionDirection>("CREDIT");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return;
    setSaving(true);
    try {
      await api.bankTransactions.create({ bankAccountId, date, description: description.trim() || undefined, amount: Number(amount), direction });
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-ink-muted">{t("reports.col.date")}</span>
          <DateInput value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} />
        </label>
        <input placeholder={t("bankRecon.descriptionPlaceholder")} value={description} onChange={(e) => setDescription(e.target.value)} className={cn(inputClass, "min-w-[200px] flex-1")} />
        <input type="number" min={0} placeholder={t("bankRecon.amountPlaceholder")} value={amount} onChange={(e) => setAmount(e.target.value)} className={cn(inputClass, "w-32")} />
        <select value={direction} onChange={(e) => setDirection(e.target.value as BankTransactionDirection)} className={inputClass}>
          <option value="CREDIT">{t("bankRecon.direction.CREDIT")}</option>
          <option value="DEBIT">{t("bankRecon.direction.DEBIT")}</option>
        </select>
        <Button type="submit" disabled={saving}>
          {saving ? t("settings.savingEllipsis") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>
          {t("common.cancel")}
        </Button>
      </form>
    </Card>
  );
}

export function BankReconciliation() {
  const [accounts, setAccounts] = useState<BankAccount[]>([]);
  const [addingAccount, setAddingAccount] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [transactions, setTransactions] = useState<BankTransaction[]>([]);
  const [bookEntries, setBookEntries] = useState<BookEntry[]>([]);
  const [summary, setSummary] = useState<BankReconciliationSummary | null>(null);
  const [addingTxn, setAddingTxn] = useState(false);
  const [selectedTxnId, setSelectedTxnId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refreshAccounts() {
    const rows = await api.bankAccounts.list();
    setAccounts(rows);
    if (!selectedAccountId && rows.length > 0) setSelectedAccountId(rows[0]._id);
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refreshAccounts().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKilnId]);

  async function refreshTransactions() {
    if (!selectedAccountId) return;
    const to = new Date().toISOString().slice(0, 10);
    const from = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10);
    const [txns, entries, sum] = await Promise.all([
      api.bankTransactions.list(selectedAccountId, { from, to }),
      api.bankTransactions.unmatchedBookEntries(from, to),
      api.bankTransactions.summary(selectedAccountId, from, to),
    ]);
    setTransactions(txns);
    setBookEntries(entries);
    setSummary(sum);
  }

  useEffect(() => {
    refreshTransactions().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAccountId]);

  useKilnEvent("bankAccount:update", () => refreshAccounts());
  useKilnEvent("bankTransaction:update", () => refreshTransactions());

  const unreconciled = transactions.filter((t) => !t.reconciled);
  const reconciled = transactions.filter((t) => t.reconciled);

  async function matchWith(entry: BookEntry) {
    if (!selectedTxnId) return;
    await api.bankTransactions.match(selectedTxnId, entry.type, entry.id);
    setSelectedTxnId(null);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {accounts.map((a) => (
            <button
              key={a._id}
              type="button"
              onClick={() => setSelectedAccountId(a._id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                selectedAccountId === a._id ? "gradient-brand text-white" : "border border-border text-ink-secondary hover:bg-ink-primary/5"
              )}
            >
              {a.bankName}
              {a.accountLabel ? ` — ${a.accountLabel}` : ""}
            </button>
          ))}
        </div>
        <Button size="sm" variant="outline" onClick={() => setAddingAccount((v) => !v)}>
          <Plus className="h-4 w-4" /> {t("bankRecon.newAccount")}
        </Button>
      </div>

      {addingAccount && (
        <AddAccountForm
          onClose={() => setAddingAccount(false)}
          onSaved={() => {
            setAddingAccount(false);
            refreshAccounts();
          }}
        />
      )}

      {accounts.length === 0 && !addingAccount && <EmptyState icon={Banknote} title={t("bankRecon.noAccountsYet")} />}

      {selectedAccountId && (
        <>
          {summary && (
            <Card>
              <CardHeader>
                <CardTitle>{t("bankRecon.summary")}</CardTitle>
              </CardHeader>
              <div className="flex flex-wrap gap-4 text-sm">
                <span className="text-status-good">{t("bankRecon.reconciledCount", { count: summary.reconciledCount, amount: formatINR(summary.reconciledAmount) })}</span>
                <span className="text-status-critical">{t("bankRecon.unreconciledCount", { count: summary.unreconciledCount, amount: formatINR(summary.unreconciledAmount) })}</span>
              </div>
            </Card>
          )}

          <div className="flex justify-end">
            <Button size="sm" variant="outline" onClick={() => setAddingTxn((v) => !v)}>
              <Plus className="h-4 w-4" /> {t("bankRecon.addTransaction")}
            </Button>
          </div>
          {addingTxn && (
            <AddTransactionForm
              bankAccountId={selectedAccountId}
              onClose={() => setAddingTxn(false)}
              onSaved={() => {
                setAddingTxn(false);
                refreshTransactions();
              }}
            />
          )}

          <p className="text-xs text-ink-muted">{t("bankRecon.selectLineToMatch")}</p>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t("bankRecon.unreconciled")}</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-1.5">
                {unreconciled.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("reports.workspace.noData")}</p>}
                {unreconciled.map((txn) => (
                  <button
                    key={txn._id}
                    type="button"
                    onClick={() => setSelectedTxnId(selectedTxnId === txn._id ? null : txn._id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-left text-sm",
                      selectedTxnId === txn._id ? "border-series-1 bg-series-1/10" : "border-border hover:bg-ink-primary/5"
                    )}
                  >
                    <span className="flex flex-col">
                      <span className="text-ink-primary">{txn.description || "—"}</span>
                      <span className="text-xs text-ink-muted">{txn.date?.slice(0, 10)}</span>
                    </span>
                    <span className={cn("tabular-nums font-medium", txn.direction === "CREDIT" ? "text-status-good" : "text-status-critical")}>
                      ₹{formatINR(txn.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t("bankRecon.bookEntries")}</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-1.5">
                {bookEntries.length === 0 && <p className="py-4 text-center text-sm text-ink-muted">{t("reports.workspace.noData")}</p>}
                {bookEntries.map((entry) => (
                  <button
                    key={`${entry.type}-${entry.id}`}
                    type="button"
                    disabled={!selectedTxnId}
                    onClick={() => matchWith(entry)}
                    className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-left text-sm hover:bg-ink-primary/5 disabled:opacity-50"
                  >
                    <span className="flex flex-col">
                      <span className="text-ink-primary">{entry.party}</span>
                      <span className="text-xs text-ink-muted">{entry.description}</span>
                    </span>
                    <span className={cn("tabular-nums font-medium", entry.direction === "CREDIT" ? "text-status-good" : "text-status-critical")}>
                      ₹{formatINR(entry.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </Card>
          </div>

          {reconciled.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("bankRecon.reconciled")}</CardTitle>
              </CardHeader>
              <div className="flex flex-col gap-1.5">
                {reconciled.map((txn) => (
                  <div key={txn._id} className="flex items-center justify-between rounded-xl border border-border px-3 py-2 text-sm">
                    <span className="flex flex-col">
                      <span className="text-ink-primary">{txn.description || "—"}</span>
                      <span className="text-xs text-ink-muted">{txn.date?.slice(0, 10)}</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums text-ink-secondary">₹{formatINR(txn.amount)}</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await api.bankTransactions.unmatch(txn._id);
                          refreshTransactions();
                        }}
                        className="text-xs font-medium text-status-critical hover:underline"
                      >
                        {t("bankRecon.unmatch")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
