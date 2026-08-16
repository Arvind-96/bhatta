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
  seasonStartMonth?: number;
  seasonStartDay?: number;
  dayShiftStart?: string;
  dayShiftEnd?: string;
  needsSetup?: boolean;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  kilns: UserKiln[];
  activeKilnId: string | null;
  setSession: (token: string, user: AuthUser, kilns: UserKiln[]) => void;
  setActiveKiln: (kilnId: string) => void;
  setKilns: (kilns: UserKiln[]) => void;
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

  setSession: (token, user, kilns) => {
    const activeKilnId = kilns[0]?.kilnId ?? null;
    const next = { token, user, kilns, activeKilnId };
    persist(next);
    set(next);
  },

  setActiveKiln: (kilnId) => {
    const state = get();
    const next = { token: state.token, user: state.user, kilns: state.kilns, activeKilnId: kilnId };
    persist(next);
    set({ activeKilnId: kilnId });
  },

  setKilns: (kilns) => {
    const state = get();
    const activeKilnId =
      state.activeKilnId && kilns.some((k) => k.kilnId === state.activeKilnId)
        ? state.activeKilnId
        : kilns[0]?.kilnId ?? null;
    const next = { token: state.token, user: state.user, kilns, activeKilnId };
    persist(next);
    set({ kilns, activeKilnId });
  },

  bootstrapPublicKiln: (kiln) => {
    const next = { token: PUBLIC_TOKEN, user: null, kilns: [kiln], activeKilnId: kiln.kilnId };
    persist(next);
    set(next);
  },

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, kilns: [], activeKilnId: null });
  },
}));
