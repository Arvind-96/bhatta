import { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import { Dashboard } from "@/pages/Dashboard";
import { api } from "@/lib/api";
import { useAuthStore } from "@/store/auth.store";

// No login screen — every visitor goes straight into the single kiln this
// deployment manages. On first load (no stored session yet) this fetches
// that kiln's public info and drops it into the auth store, standing in
// for what a login response would normally provide; every render after
// that just renders Dashboard directly, same as it always has.
export default function App() {
  const token = useAuthStore((s) => s.token);
  const bootstrapPublicKiln = useAuthStore((s) => s.bootstrapPublicKiln);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (token) return;
    api.kilns
      .public()
      .then(bootstrapPublicKiln)
      .catch((err) => setError((err as Error).message));
  }, [token, bootstrapPublicKiln]);

  if (token) return <Dashboard />;

  return (
    <div className="flex min-h-screen items-center justify-center bg-plane">
      <div className="flex flex-col items-center gap-3 text-ink-muted">
        <Flame className="h-8 w-8 animate-pulse text-series-1" />
        {error ? (
          <p className="max-w-xs text-center text-sm text-status-critical">{error}</p>
        ) : (
          <p className="text-sm">Loading your bhatta…</p>
        )}
      </div>
    </div>
  );
}
