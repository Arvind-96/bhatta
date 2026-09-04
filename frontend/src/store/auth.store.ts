import { create } from "zustand";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
}

export interface UserKiln {
  kilnId: string;
  role: "OWNER" | "MANAGER" | "MUNIM";
  name: string;
  location?: string;
  phone?: string;
  gstNumber?: string;
  stateCode?: string;
  bankAccountNumber?: string;
  bankName?: string;
  bankIfscCode?: string;
  signaturePath?: string;
  defaultTermsAndConditions?: string;
  dayShiftStart?: string;
  dayShiftEnd?: string;
  yardCapacityBricks?: number;
  needsSetup?: boolean;
}

// Mirrors backend/src/db/schema/season.ts's `seasons` row shape (as
// returned by GET /api/seasons). Exactly one entry per kiln has
// isCurrent = true at a time.
export interface UserSeason {
  _id: string;
  kilnId: string;
  label: string;
  startDate: string;
  isCurrent: boolean;
  createdAt?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  kilns: UserKiln[];
  activeKilnId: string | null;
  seasons: UserSeason[];
  activeSeasonId: string | null;
  setSession: (token: string, user: AuthUser, kilns: UserKiln[]) => void;
  setActiveKiln: (kilnId: string) => void;
  setKilns: (kilns: UserKiln[]) => void;
  setSeasons: (seasons: UserSeason[]) => void;
  setActiveSeason: (seasonId: string) => void;
  bootstrapPublicKiln: (kiln: UserKiln) => void;
  logout: () => void;
}

// The app has no login screen — this is what App.tsx calls on first load
// (see api.kilns.public()) to drop the deployment's one kiln into the
// store, standing in for what a login response would normally provide.
// The token is a placeholder, not a real credential: the backend no
// longer checks it (see auth.middleware.ts), it just needs to be
// non-empty so the rest of the app (which still gates on `token`/
// `activeKilnId` the same way it would after a real login) renders.
const PUBLIC_TOKEN = "public";

const STORAGE_KEY = "bhatta_auth";

interface StoredSession {
  token: string | null;
  user: AuthUser | null;
  kilns: UserKiln[];
  activeKilnId: string | null;
}

function loadStoredSession(): StoredSession {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { token: null, user: null, kilns: [], activeKilnId: null };
    return JSON.parse(raw);
  } catch {
    return { token: null, user: null, kilns: [], activeKilnId: null };
  }
}

function persist(state: StoredSession) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export const useAuthStore = create<AuthState>((set, get) => ({
  ...loadStoredSession(),
  // Deliberately not persisted (see StoredSession) — always starts pointed
  // at whatever's current and gets fetched fresh on mount (Dashboard's own
  // effect), so a page refresh never leaves the admin silently stuck
  // viewing a read-only archived season without realizing it.
  seasons: [] as UserSeason[],
  activeSeasonId: null as string | null,

  setSession: (token, user, kilns) => {
    const activeKilnId = kilns[0]?.kilnId ?? null;
    const next = { token, user, kilns, activeKilnId };
    persist(next);
    set({ ...next, seasons: [], activeSeasonId: null });
  },

  setActiveKiln: (kilnId) => {
    const state = get();
    const next = { token: state.token, user: state.user, kilns: state.kilns, activeKilnId: kilnId };
    persist(next);
    // Seasons belong to one kiln — clear the old kiln's list/selection
    // immediately so no request in flight can carry a foreign X-Season-Id
    // while Dashboard's effect re-fetches the new kiln's seasons.
    set({ activeKilnId: kilnId, seasons: [], activeSeasonId: null });
  },

  setKilns: (kilns) => {
    const state = get();
    const activeKilnId =
      state.activeKilnId && kilns.some((k) => k.kilnId === state.activeKilnId)
        ? state.activeKilnId
        : kilns[0]?.kilnId ?? null;
    const kilnChanged = activeKilnId !== state.activeKilnId;
    const next = { token: state.token, user: state.user, kilns, activeKilnId };
    persist(next);
    set(kilnChanged ? { kilns, activeKilnId, seasons: [], activeSeasonId: null } : { kilns, activeKilnId });
  },

  setSeasons: (seasons) => {
    const state = get();
    const activeSeasonId =
      state.activeSeasonId && seasons.some((s) => s._id === state.activeSeasonId)
        ? state.activeSeasonId
        : seasons.find((s) => s.isCurrent)?._id ?? seasons[0]?._id ?? null;
    set({ seasons, activeSeasonId });
  },

  setActiveSeason: (seasonId) => set({ activeSeasonId: seasonId }),

  bootstrapPublicKiln: (kiln) => {
    const next = { token: PUBLIC_TOKEN, user: null, kilns: [kiln], activeKilnId: kiln.kilnId };
    persist(next);
    set({ ...next, seasons: [], activeSeasonId: null });
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, kilns: [], activeKilnId: null, seasons: [], activeSeasonId: null });
  },
}));
