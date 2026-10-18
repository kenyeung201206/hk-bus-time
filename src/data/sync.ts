import { openDB } from 'idb';
import { create } from 'zustand';
import type { BusData } from '../types';
import { BusIndex } from './busIndex';
import { fetchAllBusData } from './fetchAll.ts';

const DAY = 24 * 3600 * 1000;

const dbp = () =>
  openDB('hkbus', 1, {
    upgrade(db) {
      db.createObjectStore('kv');
    },
  });

async function readCache(): Promise<{ data: BusData; syncedAt: number } | undefined> {
  try {
    const db = await dbp();
    const hit = await db.get('kv', 'busdata');
    if (!hit) return undefined;
    // a later check that found nothing newer only bumps the timestamp
    const checkedAt: number | undefined = await db.get('kv', 'checkedAt');
    return { data: hit.data, syncedAt: Math.max(hit.syncedAt, checkedAt ?? 0) };
  } catch {
    return undefined;
  }
}

async function markChecked() {
  try {
    await (await dbp()).put('kv', Date.now(), 'checkedAt');
  } catch {
    /* ignore */
  }
}

async function writeCache(data: BusData) {
  try {
    await (await dbp()).put('kv', { data, syncedAt: Date.now() }, 'busdata');
  } catch {
    /* private mode etc. — app still works for this session */
  }
}

export async function clearCache() {
  try {
    await (await dbp()).clear('kv');
  } catch {
    /* ignore */
  }
}

interface DataState {
  index: BusIndex | null;
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: { step: number; total: number; done: number; of: number };
  syncedAt: number | null;
  updating: boolean;
  load: () => Promise<void>;
  updateNow: () => Promise<void>;
}

/** The deployed bus-data.json is a snapshot; past this age the app rebuilds it from the APIs itself. */
export const SNAPSHOT_MAX_AGE = 7 * DAY;

const age = (d: { generatedAt: string } | null | undefined) =>
  d ? Date.now() - Date.parse(d.generatedAt) : Infinity;

type OnProgress = (step: number, done: number, of: number) => void;

async function fetchSnapshot(): Promise<BusData | null> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}bus-data.json`, { cache: 'no-cache' });
    if (!res.ok) return null;
    const data = (await res.json()) as BusData;
    return data?.routes?.length ? data : null;
  } catch {
    return null;
  }
}

const fetchFromApis = (onProgress: OnProgress) =>
  fetchAllBusData({
    concurrency: 8,
    onProgress: (msg, done, of) => onProgress(msg === 'kmb' ? 1 : 2, done, of),
  });

/** First launch: the snapshot if there is one (fast), else straight from the APIs. */
async function downloadFirst(onProgress: OnProgress): Promise<BusData> {
  onProgress(1, 0, 1);
  const snap = await fetchSnapshot();
  if (snap) {
    onProgress(2, 1, 1);
    return snap;
  }
  return fetchFromApis(onProgress);
}

/**
 * Refresh: a newer snapshot if it is under 7 days old; otherwise rebuild from the APIs —
 * but only when the data we already have is also over 7 days old (avoids ~3,000 requests a day).
 * Returns null when there is nothing newer worth taking.
 */
async function downloadFresh(current: BusData | { generatedAt: string } | null): Promise<BusData | null> {
  const snap = await fetchSnapshot();
  if (snap && age(snap) < SNAPSHOT_MAX_AGE) return age(snap) < age(current) ? snap : null;
  if (age(current) < SNAPSHOT_MAX_AGE) return null;
  try {
    return await fetchFromApis(() => {});
  } catch {
    return snap && age(snap) < age(current) ? snap : null;
  }
}

export const useData = create<DataState>()((set, get) => ({
  index: null,
  status: 'idle',
  progress: { step: 1, total: 2, done: 0, of: 1 },
  syncedAt: null,
  updating: false,

  load: async () => {
    if (get().status === 'loading' || get().status === 'ready') return;
    set({ status: 'loading' });
    const cached = await readCache();
    if (cached) {
      set({ index: new BusIndex(cached.data), status: 'ready', syncedAt: cached.syncedAt });
      // stale-while-revalidate: check for newer data in the background once a day
      if (Date.now() - cached.syncedAt > DAY && navigator.onLine) get().updateNow();
      return;
    }
    try {
      const data = await downloadFirst((step, done, of) => set({ progress: { step, total: 2, done, of } }));
      await writeCache(data);
      set({ index: new BusIndex(data), status: 'ready', syncedAt: Date.now() });
      // an old snapshot is fine to start with; rebuild it from the APIs in the background
      if (age(data) > SNAPSHOT_MAX_AGE && navigator.onLine) get().updateNow();
    } catch {
      set({ status: 'error' });
    }
  },

  updateNow: async () => {
    if (get().updating) return;
    set({ updating: true });
    try {
      const data = await downloadFresh(get().index);
      if (data) {
        await writeCache(data);
        set({ index: new BusIndex(data), status: 'ready' });
      }
      await markChecked();
      set({ syncedAt: Date.now() });
    } catch {
      /* keep old data */
    } finally {
      set({ updating: false });
    }
  },
}));
