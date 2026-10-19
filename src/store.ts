import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Favourite, SavedTrip } from './types';
import type { ThemeId } from './themes';
import type { VoiceId } from './alerts/voice';
import type { Company, Dir } from './types';

export const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---------- settings ----------
interface Settings {
  theme: ThemeId;
  mode: 'auto' | 'light' | 'dark';
  textSize: 'normal' | 'large' | 'xl';
  refreshSec: number;
  /** master switch for spoken arrival reminders */
  alertsOn: boolean;
  /** default minutes before arrival for the first reminder (any number ≥ 1) */
  alertStart: number;
  /** repeat every N minutes (1–5) down to 1 minute */
  alertStep: number;
  voice: VoiceId;
  keepAwake: boolean;
  /** use GPS to find the nearest stop and walking distance */
  useLocation: boolean;
  set: (p: Partial<Omit<Settings, 'set'>>) => void;
}

export const useSettings = create<Settings>()(
  persist(
    (set) => ({
      theme: 'strawberry',
      mode: 'auto',
      textSize: 'normal',
      refreshSec: 30,
      alertsOn: false,
      alertStart: 10,
      alertStep: 3,
      voice: 'hiugaai',
      keepAwake: true,
      useLocation: true,
      set: (p) => set(p),
    }),
    {
      name: 'hkbus.settings',
      version: 2,
      // v1: the phone's built-in voice (often Mandarin) was replaced by a Cantonese child voice
      // v2: the first 型格 themes were redesigned under new names
      migrate: (state) => {
        const st = state as Partial<Settings>;
        if ((st.voice as string) === 'device') st.voice = 'kid';
        const renamed: Record<string, ThemeId> = { neon: 'navy', gold: 'mono', racing: 'concrete' };
        if (st.theme && renamed[st.theme as string]) st.theme = renamed[st.theme as string];
        return st as Settings;
      },
    },
  ),
);

// ---------- favourites, trips, recents ----------
interface FavState {
  favourites: Favourite[];
  savedTrips: SavedTrip[];
  recentSearches: string[];
  recentTrips: { from: string; to: string }[];
  addFav: (f: Omit<Favourite, 'id' | 'sortOrder' | 'createdAt'>) => boolean;
  removeFav: (id: string) => void;
  renameFav: (id: string, label: string) => void;
  moveFav: (id: string, delta: number) => void;
  setGroup: (id: string, group: Favourite['group']) => void;
  isFav: (co: string, route: string, dir: string, st: number, stopId: string) => Favourite | undefined;
  addTrip: (t: Omit<SavedTrip, 'id' | 'createdAt'>) => void;
  removeTrip: (id: string) => void;
  pushRecentSearch: (q: string) => void;
  pushRecentTrip: (from: string, to: string) => void;
  importBackup: (data: unknown) => boolean;
}

export const useFavs = create<FavState>()(
  persist(
    (set, get) => ({
      favourites: [],
      savedTrips: [],
      recentSearches: [],
      recentTrips: [],
      addFav: (f) => {
        if (get().isFav(f.co, f.route, f.dir, f.serviceType, f.stopId)) return false;
        set((s) => ({
          favourites: [...s.favourites, { ...f, id: uid(), sortOrder: s.favourites.length, createdAt: Date.now() }],
        }));
        return true;
      },
      removeFav: (id) => set((s) => ({ favourites: s.favourites.filter((f) => f.id !== id) })),
      renameFav: (id, label) =>
        set((s) => ({ favourites: s.favourites.map((f) => (f.id === id ? { ...f, label: label || undefined } : f)) })),
      moveFav: (id, delta) =>
        set((s) => {
          const list = [...s.favourites].sort((a, b) => a.sortOrder - b.sortOrder);
          const i = list.findIndex((f) => f.id === id);
          const j = i + delta;
          if (i < 0 || j < 0 || j >= list.length) return s;
          [list[i], list[j]] = [list[j], list[i]];
          return { favourites: list.map((f, k) => ({ ...f, sortOrder: k })) };
        }),
      setGroup: (id, group) =>
        set((s) => ({ favourites: s.favourites.map((f) => (f.id === id ? { ...f, group } : f)) })),
      isFav: (co, route, dir, st, stopId) =>
        get().favourites.find(
          (f) => f.co === co && f.route === route && f.dir === dir && f.serviceType === st && f.stopId === stopId,
        ),
      addTrip: (t) => set((s) => ({ savedTrips: [...s.savedTrips, { ...t, id: uid(), createdAt: Date.now() }] })),
      removeTrip: (id) => set((s) => ({ savedTrips: s.savedTrips.filter((t) => t.id !== id) })),
      pushRecentSearch: (q) =>
        set((s) => ({ recentSearches: [q, ...s.recentSearches.filter((x) => x !== q)].slice(0, 8) })),
      pushRecentTrip: (from, to) =>
        set((s) => ({
          recentTrips: [{ from, to }, ...s.recentTrips.filter((x) => x.from !== from || x.to !== to)].slice(0, 6),
        })),
      importBackup: (data) => {
        const d = data as Partial<FavState>;
        if (!d || !Array.isArray(d.favourites)) return false;
        set({ favourites: d.favourites, savedTrips: Array.isArray(d.savedTrips) ? d.savedTrips : [] });
        return true;
      },
    }),
    {
      name: 'hkbus.favs',
      partialize: (s) => ({
        favourites: s.favourites,
        savedTrips: s.savedTrips,
        recentSearches: s.recentSearches,
        recentTrips: s.recentTrips,
      }),
    },
  ),
);

// ---------- transient UI state ----------
interface UiState {
  toast: string | null;
  showToast: (msg: string) => void;
  /** last time any live ETA loaded successfully */
  lastUpdated: number | null;
  markUpdated: () => void;
}
let toastTimer: ReturnType<typeof setTimeout> | undefined;
export const useUi = create<UiState>()((set) => ({
  toast: null,
  lastUpdated: null,
  markUpdated: () => set({ lastUpdated: Date.now() }),
  showToast: (msg) => {
    clearTimeout(toastTimer);
    set({ toast: msg });
    toastTimer = setTimeout(() => set({ toast: null }), 2200);
  },
}));

// ---------- spoken arrival reminders ----------
export interface BusAlert {
  id: string;
  co: Company;
  route: string;
  dir: Dir;
  serviceType: number;
  stopId: string;
  /** 1-based position of the stop on the route (circular routes) */
  seq: number;
  stopName: string;
  /** minute marks still to announce, e.g. [10, 7, 4, 1] */
  pending: number[];
  marks: number[];
  createdAt: number;
  lastSaid?: number;
  /** id of this reminder on the push server (lock-screen notifications) */
  serverId?: string;
}

export const alertKey = (a: { co: string; route: string; dir: string; serviceType: number; stopId: string }) =>
  `${a.co}-${a.route}-${a.dir}-${a.serviceType}-${a.stopId}`;

interface AlertState {
  alerts: BusAlert[];
  arm: (a: Omit<BusAlert, 'id' | 'createdAt' | 'pending'>) => void;
  disarm: (key: string) => void;
  update: (key: string, p: Partial<BusAlert>) => void;
  find: (key: string) => BusAlert | undefined;
}

export const useAlerts = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: [],
      arm: (a) =>
        set((s) => ({
          alerts: [
            ...s.alerts.filter((x) => alertKey(x) !== alertKey(a)),
            { ...a, id: uid(), createdAt: Date.now(), pending: [...a.marks] },
          ],
        })),
      disarm: (key) => set((s) => ({ alerts: s.alerts.filter((x) => alertKey(x) !== key) })),
      update: (key, p) => set((s) => ({ alerts: s.alerts.map((x) => (alertKey(x) === key ? { ...x, ...p } : x)) })),
      find: (key) => get().alerts.find((x) => alertKey(x) === key),
    }),
    { name: 'hkbus.alerts' },
  ),
);
