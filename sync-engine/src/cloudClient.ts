import fetch from "node-fetch";

const API_URL = process.env.API_URL ?? "http://localhost:4000";
const SYNC_EMAIL = process.env.SYNC_EMAIL ?? "";
const SYNC_PASSWORD = process.env.SYNC_PASSWORD ?? "";

let cachedToken: string | null = null;
let cachedKilnId: string | null = null;

interface KilnMembershipDto {
  kilnId: string;
  role: string;
  name: string;
}

// This account (created once via POST /api/auth/register, role MUNIM or
// OWNER) represents "this kiln site". A munim account normally belongs to
// exactly one kiln — SYNC_KILN_ID only needs setting if the account happens
// to have more than one (an owner's credentials reused for a specific site).
async function login(): Promise<{ token: string; kilnId: string }> {
  const res = await fetch(`${API_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: SYNC_EMAIL, password: SYNC_PASSWORD }),
  });

  if (!res.ok) {
    throw new Error(`Sync engine login failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { token: string; kilns: KilnMembershipDto[] };
  const configuredKilnId = process.env.SYNC_KILN_ID;
  const kiln = configuredKilnId
    ? data.kilns.find((k) => k.kilnId === configuredKilnId)
    : data.kilns[0];

  if (!kiln) {
    throw new Error("Sync account has no matching kiln membership — check SYNC_KILN_ID");
  }

  cachedToken = data.token;
  cachedKilnId = kiln.kilnId;
  console.log(`[sync] authenticated for kiln "${kiln.name}" (${kiln.kilnId})`);
  return { token: data.token, kilnId: kiln.kilnId };
}

export interface SyncChange {
  entityType: "production" | "stock";
  localId: string;
  payload: Record<string, unknown>;
}

export async function pushChangesToCloud(changes: SyncChange[]) {
  if (!cachedToken || !cachedKilnId) await login();

  const attempt = (token: string, kilnId: string) =>
    fetch(`${API_URL}/api/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "X-Kiln-Id": kilnId,
      },
      body: JSON.stringify({ changes }),
    });

  let res = await attempt(cachedToken!, cachedKilnId!);
  if (res.status === 401 || res.status === 403) {
    const fresh = await login();
    res = await attempt(fresh.token, fresh.kilnId);
  }

  if (!res.ok) {
    throw new Error(`Sync push failed: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<{ applied: number }>;
}
