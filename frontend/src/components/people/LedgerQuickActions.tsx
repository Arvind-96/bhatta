import { useState } from "react";
import { QuickLedgerModal, type QuickLedgerCategory } from "./QuickLedgerModal";
import type { Person } from "@/types";
import { useTranslation } from "@/hooks/useTranslation";

interface LedgerQuickActionsProps {
  person: Person;
  onSaved: () => void;
}

const ACTIONS: { key: QuickLedgerCategory; labelKey: string }[] = [
  { key: "ADVANCE", labelKey: "people.advance" },
  { key: "KHARCHI", labelKey: "people.kharchi" },
  { key: "MEDICAL", labelKey: "people.medical" },
  { key: "FESTIVAL", labelKey: "people.festival" },
];

// The four top-level ledger CTAs shown at the very top of a contractor/
// labor profile — replaces the old single "Advance / Kharchi" button.
// Each opens QuickLedgerModal preset to its own category so logging one is
// a two-field form (amount + reason), not the full generic LedgerModal.
export function LedgerQuickActions({ person, onSaved }: LedgerQuickActionsProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<QuickLedgerCategory | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {ACTIONS.map((a) => (
          <button
            key={a.key}
            onClick={() => setActive(a.key)}
            className="rounded-lg border border-border bg-ink-primary/5 px-3 py-1.5 text-xs font-medium text-ink-secondary transition-colors hover:bg-ink-primary/10 hover:text-ink-primary"
          >
            {t(a.labelKey)}
          </button>
        ))}
      </div>
      {active && (
        <QuickLedgerModal person={person} category={active} onClose={() => setActive(null)} onSaved={onSaved} />
      )}
    </>
  );
}
