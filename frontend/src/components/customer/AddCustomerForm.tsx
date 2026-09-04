import { FormEvent, useState } from "react";
import { Plus, X } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useTranslation } from "@/hooks/useTranslation";
import { VehicleNumberInput } from "@/components/shared/VehicleNumberInput";
import { formatVehicleNumber } from "@/lib/utils";
import type { Customer } from "@/types";

const inputClass =
  "h-10 rounded-xl border border-border bg-ink-primary/5 px-3 text-sm text-ink-primary outline-none focus:ring-2 focus:ring-series-1";

interface AddCustomerFormProps {
  existing?: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

// A customer can have more than one phone number, address, driver, and
// vehicle (see the schema comment on the customers table) -- each of the
// four sections below is a plain array the admin grows with "+ Add
// another" and shrinks with the row's own X button; empty rows are
// dropped on submit rather than saved as blank entries.
export function AddCustomerForm({ existing, onClose, onSaved }: AddCustomerFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState(existing?.name ?? "");
  const [phones, setPhones] = useState<string[]>(existing?.phones?.length ? existing.phones : [""]);
  const [addresses, setAddresses] = useState<string[]>(existing?.addresses?.length ? existing.addresses : [""]);
  const [drivers, setDrivers] = useState(existing?.drivers?.length ? existing.drivers : [{ name: "", phone: "", address: "" }]);
  const [vehicles, setVehicles] = useState(
    existing?.vehicles?.length
      ? existing.vehicles.map((v) => ({ ...v, vehicleNumber: formatVehicleNumber(v.vehicleNumber) }))
      : [{ vehicleType: "TRUCK", vehicleNumber: "" }]
  );
  const [openingPaid, setOpeningPaid] = useState(existing ? String(existing.openingPaid) : "");
  const [openingDue, setOpeningDue] = useState(existing ? String(existing.openingDue) : "");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setFormError("");
    setSaving(true);
    try {
      const payload = {
        name,
        phones: phones.map((p) => p.trim()).filter(Boolean),
        addresses: addresses.map((a) => a.trim()).filter(Boolean),
        drivers: drivers.filter((d) => d.name.trim() || d.phone.trim() || d.address.trim()),
        vehicles: vehicles.filter((v) => v.vehicleNumber.trim()),
        openingPaid: openingPaid ? Number(openingPaid) : 0,
        openingDue: openingDue ? Number(openingDue) : 0,
      };
      const saved = existing ? await api.customers.update(existing._id, payload) : await api.customers.create(payload);
      onSaved(saved);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : t("common.somethingWentWrong"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-primary">{existing ? t("customer.editCustomerTitle") : t("customer.addCustomerTitle")}</h3>
        <button onClick={onClose} className="text-ink-muted hover:text-ink-primary">
          <X className="h-4 w-4" />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input required placeholder={t("customer.customerNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.phonesSection")}</p>
          {phones.map((phone, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input
                placeholder={t("customer.phonePlaceholder")}
                value={phone}
                onChange={(e) => setPhones((p) => p.map((v, j) => (j === i ? e.target.value : v)))}
                className={inputClass + " flex-1"}
              />
              {phones.length > 1 && (
                <button type="button" onClick={() => setPhones((p) => p.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-critical">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setPhones((p) => [...p, ""])} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t("customer.addAnotherPhone")}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.addressesSection")}</p>
          {addresses.map((address, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <input
                placeholder={t("customer.addressPlaceholder")}
                value={address}
                onChange={(e) => setAddresses((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                className={inputClass + " flex-1"}
              />
              {addresses.length > 1 && (
                <button type="button" onClick={() => setAddresses((a) => a.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-critical">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setAddresses((a) => [...a, ""])} className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline">
            <Plus className="h-3.5 w-3.5" /> {t("customer.addAnotherAddress")}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.driversSection")}</p>
          {drivers.map((driver, i) => (
            <div key={i} className="mb-2 grid grid-cols-3 gap-2">
              <input
                placeholder={t("brickLoading.driverNamePlaceholder")}
                value={driver.name}
                onChange={(e) => setDrivers((d) => d.map((v, j) => (j === i ? { ...v, name: e.target.value } : v)))}
                className={inputClass}
              />
              <input
                placeholder={t("brickLoading.driverPhonePlaceholder")}
                value={driver.phone}
                onChange={(e) => setDrivers((d) => d.map((v, j) => (j === i ? { ...v, phone: e.target.value } : v)))}
                className={inputClass}
              />
              <div className="flex gap-2">
                <input
                  placeholder={t("customer.driverAddressPlaceholder")}
                  value={driver.address}
                  onChange={(e) => setDrivers((d) => d.map((v, j) => (j === i ? { ...v, address: e.target.value } : v)))}
                  className={inputClass + " flex-1"}
                />
                {drivers.length > 1 && (
                  <button type="button" onClick={() => setDrivers((d) => d.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-critical">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setDrivers((d) => [...d, { name: "", phone: "", address: "" }])}
            className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("customer.addAnotherDriver")}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.vehiclesSection")}</p>
          {vehicles.map((vehicle, i) => (
            <div key={i} className="mb-2 flex gap-2">
              <select
                value={vehicle.vehicleType}
                onChange={(e) => setVehicles((v) => v.map((x, j) => (j === i ? { ...x, vehicleType: e.target.value } : x)))}
                className={inputClass}
              >
                <option value="TRUCK">{t("brickLoading.truck")}</option>
                <option value="TRACTOR">{t("brickLoading.tractor")}</option>
              </select>
              <VehicleNumberInput
                placeholder={t("dispatch.vehicleNumberPlaceholder")}
                value={vehicle.vehicleNumber}
                onChange={(value) => setVehicles((v) => v.map((x, j) => (j === i ? { ...x, vehicleNumber: value } : x)))}
                className={inputClass + " flex-1"}
              />
              {vehicles.length > 1 && (
                <button type="button" onClick={() => setVehicles((v) => v.filter((_, j) => j !== i))} className="text-ink-muted hover:text-status-critical">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setVehicles((v) => [...v, { vehicleType: "TRUCK", vehicleNumber: "" }])}
            className="flex items-center gap-1 text-xs font-medium text-series-1 hover:underline"
          >
            <Plus className="h-3.5 w-3.5" /> {t("customer.addAnotherVehicle")}
          </button>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{t("customer.openingBalanceSection")}</p>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="number"
              placeholder={t("customer.totalPaymentPaidPlaceholder")}
              value={openingPaid}
              onChange={(e) => setOpeningPaid(e.target.value)}
              className={inputClass}
            />
            <input
              type="number"
              placeholder={t("customer.totalPaymentDuePlaceholder")}
              value={openingDue}
              onChange={(e) => setOpeningDue(e.target.value)}
              className={inputClass}
            />
          </div>
          <p className="mt-1 text-xs text-ink-muted">{t("customer.openingBalanceHint")}</p>
        </div>

        {formError && <p className="text-sm text-status-critical">{formError}</p>}
        <Button type="submit" disabled={saving}>
          {existing ? t("common.saveChanges") : t("customer.saveCustomer")}
        </Button>
      </form>
    </Card>
  );
}
