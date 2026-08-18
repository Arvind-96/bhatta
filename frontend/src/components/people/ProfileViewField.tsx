// A read-only "label above, value below" pair — the default display for a
// profile field when the page isn't in edit mode. Falls back to an em-dash
// for an unset value rather than rendering empty, so a glance at the card
// tells you what's actually on file vs. what still needs filling in.
export function ProfileViewField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="text-sm font-medium text-ink-primary">{value ?? "—"}</span>
    </div>
  );
}
