import { useState } from "react";
import { QuickLedgerModal, type QuickLedgerCategory } from "./QuickLedgerModal";
import { Button } from "@/components/ui/button";
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
          <Button key={a.key} variant="outline" size="sm" onClick={() => setActive(a.key)}>
            {t(a.labelKey)}
          </Button>
        ))}
      </div>
      {active && (
        <QuickLedgerModal person={person} category={active} onClose={() => setActive(null)} onSaved={onSaved} />
      )}
    </>
  );
}
