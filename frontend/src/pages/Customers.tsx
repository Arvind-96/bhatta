import { useEffect, useState } from "react";
import { List, Search, UserPlus } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, usePagination } from "@/components/ui/pagination";
import { api } from "@/lib/api";
import { useKilnEvent } from "@/hooks/useKilnEvent";
import { useAuthStore } from "@/store/auth.store";
import { useTranslation } from "@/hooks/useTranslation";
import { cn } from "@/lib/utils";
import { AddCustomerForm } from "@/components/customer/AddCustomerForm";
import { CustomerDetailPage } from "@/components/customer/CustomerDetailPage";
import type { Customer } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

// Two modes toggled by the page's own "Add Customer"/"Customer List"
// buttons (item 2) rather than the two being separate nav destinations —
// Customer List is the default landing view.
export function Customers() {
  const [mode, setMode] = useState<"list" | "add">("list");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const activeKilnId = useAuthStore((s) => s.activeKilnId);
  const { t } = useTranslation();

  async function refresh() {
    setCustomers(await api.customers.list());
  }

  useEffect(() => {
    if (!activeKilnId) return;
    refresh().catch(console.error);
  }, [activeKilnId]);

  useKilnEvent("customer:update", () => refresh());

  const filtered = customers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.phones.some((p) => p.includes(q)) || c.vehicles.some((v) => v.vehicleNumber.toLowerCase().includes(q));
  });
  const { page, setPage, pageCount, pageItems: pagedCustomers, total } = usePagination(filtered, 10);

  if (openId) {
    return <CustomerDetailPage customerId={openId} onBack={() => setOpenId(null)} onDeleted={() => setOpenId(null)} />;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end gap-2">
        <Button size="sm" variant={mode === "add" ? "primary" : "outline"} onClick={() => setMode("add")}>
          <UserPlus className="h-4 w-4" /> {t("customer.addCustomerButton")}
        </Button>
        <Button size="sm" variant={mode === "list" ? "primary" : "outline"} onClick={() => setMode("list")}>
          <List className="h-4 w-4" /> {t("customer.customerListButton")}
        </Button>
      </div>

      {mode === "add" ? (
        <AddCustomerForm
          onClose={() => setMode("list")}
          onSaved={() => {
            setMode("list");
            refresh();
          }}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t("nav.customers")}</CardTitle>
          </CardHeader>
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
              placeholder={t("customer.searchCustomersPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(inputClass, "w-full max-w-sm pl-9")}
            />
          </div>
          {customers.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("customer.noCustomersYet")}</p>
          ) : filtered.length === 0 ? (
            <p className="py-8 text-center text-sm text-ink-muted">{t("dispatchDocs.noMatchSearch")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-sm text-ink-muted">
                    <th className="pb-2 font-medium">{t("customer.customerNamePlaceholder")}</th>
                    <th className="pb-2 font-medium">{t("customer.phonesSection")}</th>
                    <th className="pb-2 font-medium">{t("customer.vehiclesSection")}</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCustomers.map((c) => (
                    <tr key={c._id} onClick={() => setOpenId(c._id)} className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-ink-primary/5">
                      <td className="py-3 text-ink-primary hover:underline">{c.name}</td>
                      <td className="py-3 text-ink-secondary">{c.phones[0] ?? "—"}</td>
                      <td className="py-3 text-ink-secondary">{c.vehicles[0]?.vehicleNumber ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <Pagination page={page} pageCount={pageCount} onChange={setPage} total={total} pageSize={10} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
