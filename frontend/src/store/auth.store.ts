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
  logout: () => void;
}

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

  logout: () => {
    localStorage.removeItem(STORAGE_KEY);
    set({ token: null, user: null, kilns: [], activeKilnId: null });
  },
}));
