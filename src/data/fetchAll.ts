// Downloads all static data (routes, stops, route-stops) for KMB + CTB and
// produces the compact BusData format. Shared by scripts/build-bus-data.ts
// (Node) and the in-app fallback sync (browser).
import type { BusData, Company, Dir } from '../types.ts';

export const KMB_BASE = 'https://data.etabus.gov.hk/v1/transport/kmb';
export const CTB_BASE = 'https://rt.data.gov.hk/v2/transport/citybus';

type Progress = (msg: string, done: number, total: number) => void;

export interface FetchOptions {
  headers?: Record<string, string>;
  concurrency?: number;
  onProgress?: Progress;
}

async function getJson(url: string, headers?: Record<string, string>, tries = 3): Promise<any> {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (e) {
      if (i >= tries - 1) throw e;
      await new Promise((r) => setTimeout(r, 800 * (i + 1)));
    }
  }
}

async function pool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>, tick?: () => void): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
        tick?.();
      }
    }),
  );
  return out;
}

const rid = (co: Company, route: string, dir: Dir, st: number) => `${co}-${route}-${dir}-${st}`;

export async function fetchAllBusData(opts: FetchOptions = {}): Promise<BusData> {
  const { headers, concurrency = 8, onProgress } = opts;
  const data: BusData = { version: 1, generatedAt: new Date().toISOString(), routes: [], stops: {}, routeStops: {} };

  // ---- KMB: three bulk endpoints ----
  onProgress?.('kmb', 0, 3);
  const [kr, ks, krs] = await Promise.all([
    getJson(`${KMB_BASE}/route/`, headers),
    getJson(`${KMB_BASE}/stop`, headers),
    getJson(`${KMB_BASE}/route-stop`, headers),
  ]);
  onProgress?.('kmb', 3, 3);
  for (const r of kr.data) {
    data.routes.push(['KMB', r.route, r.bound, +r.service_type, r.orig_tc, r.dest_tc, r.orig_en, r.dest_en, r.orig_sc, r.dest_sc]);
  }
  for (const s of ks.data) {
    data.stops[`KMB-${s.stop}`] = [s.name_tc, s.name_en, s.name_sc, +s.lat, +s.long];
  }
  const kmbSeq: Record<string, [number, string][]> = {};
  for (const x of krs.data) {
    (kmbSeq[rid('KMB', x.route, x.bound, +x.service_type)] ??= []).push([+x.seq, x.stop]);
  }
  for (const [id, list] of Object.entries(kmbSeq)) {
    data.routeStops[id] = list.sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  }

  // ---- CTB: route list, then route-stop per route+dir, then each stop ----
  const cr = await getJson(`${CTB_BASE}/route/CTB`, headers);
  const jobs: { route: string; dir: Dir; r: any }[] = [];
  for (const r of cr.data) {
    jobs.push({ route: r.route, dir: 'O', r }, { route: r.route, dir: 'I', r });
  }
  let done = 0;
  const lists = await pool(
    jobs,
    concurrency,
    async (j) => {
      try {
        const res = await getJson(`${CTB_BASE}/route-stop/CTB/${j.route}/${j.dir === 'O' ? 'outbound' : 'inbound'}`, headers);
        return (res.data as any[]).sort((a, b) => a.seq - b.seq).map((x) => x.stop as string);
      } catch {
        return [];
      }
    },
    () => onProgress?.('ctb-routes', ++done, jobs.length),
  );
  const ctbStopIds = new Set<string>();
  jobs.forEach((j, i) => {
    const stops = lists[i];
    if (!stops.length) return;
    const r = j.r;
    // CTB route list gives one orientation (outbound); inbound swaps orig/dest.
    const [oTc, dTc, oEn, dEn, oSc, dSc] =
      j.dir === 'O'
        ? [r.orig_tc, r.dest_tc, r.orig_en, r.dest_en, r.orig_sc, r.dest_sc]
        : [r.dest_tc, r.orig_tc, r.dest_en, r.orig_en, r.dest_sc, r.orig_sc];
    data.routes.push(['CTB', j.route, j.dir, 1, oTc, dTc, oEn, dEn, oSc, dSc]);
    data.routeStops[rid('CTB', j.route, j.dir, 1)] = stops;
    stops.forEach((s) => ctbStopIds.add(s));
  });

  done = 0;
  const ids = [...ctbStopIds];
  await pool(
    ids,
    concurrency,
    async (id) => {
      try {
        const s = (await getJson(`${CTB_BASE}/stop/${id}`, headers)).data;
        if (s?.stop) data.stops[`CTB-${id}`] = [s.name_tc, s.name_en, s.name_sc, +s.lat, +s.long];
      } catch {
        /* skip a stop we could not load */
      }
    },
    () => onProgress?.('ctb-stops', ++done, ids.length),
  );

  return data;
}
