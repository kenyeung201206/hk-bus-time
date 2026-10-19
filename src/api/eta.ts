import type { Company, Dir } from '../types';
import { CTB_BASE, KMB_BASE } from '../data/fetchAll.ts';

export interface EtaRow {
  co: Company;
  route: string;
  dir: Dir;
  serviceType: number;
  seq: number;
  etaSeq: number;
  eta: Date | null;
  remarkTc: string;
  destTc: string;
  dataTimestamp: Date;
}

export interface EtaResult {
  rows: EtaRow[];
  fetchedAt: number;
}

const TTL = 8_000;
const cache = new Map<string, { at: number; p: Promise<EtaResult> }>();

async function fetchWithTimeout(url: string, ms = 8000): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    if (!res.ok) throw new Error(String(res.status));
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function normalise(raw: any, co: Company): EtaRow[] {
  return ((raw?.data ?? []) as any[]).map((x) => ({
    co,
    route: x.route,
    dir: x.dir,
    serviceType: x.service_type ? +x.service_type : 1,
    seq: +x.seq,
    etaSeq: +x.eta_seq,
    eta: x.eta ? new Date(x.eta) : null,
    remarkTc: x.rmk_tc ?? '',
    destTc: x.dest_tc ?? '',
    dataTimestamp: new Date(x.data_timestamp),
  }));
}

/** Cached (15 s), de-duplicated, timeout 8 s, retried once. */
function get(url: string, co: Company, force = false): Promise<EtaResult> {
  const hit = cache.get(url);
  if (!force && hit && Date.now() - hit.at < TTL) return hit.p;
  const p = (async () => {
    let raw;
    try {
      raw = await fetchWithTimeout(url);
    } catch {
      raw = await fetchWithTimeout(url);
    }
    return { rows: normalise(raw, co), fetchedAt: Date.now() };
  })();
  cache.set(url, { at: Date.now(), p });
  p.catch(() => cache.delete(url));
  return p;
}

/** ETA rows for one route at one stop, filtered to the direction (and seq for circular routes). */
export async function getArrivals(
  co: Company,
  route: string,
  dir: Dir,
  serviceType: number,
  stopId: string,
  seq?: number,
  force = false,
): Promise<EtaResult> {
  const url =
    co === 'KMB'
      ? `${KMB_BASE}/eta/${stopId}/${encodeURIComponent(route)}/${serviceType}`
      : `${CTB_BASE}/eta/CTB/${stopId}/${encodeURIComponent(route)}`;
  const res = await get(url, co, force);
  let rows = res.rows.filter((r) => r.dir === dir && (co === 'CTB' || r.serviceType === serviceType));
  // A stop that appears twice on a circular route: keep the requested occurrence.
  if (seq !== undefined && new Set(rows.map((r) => r.seq)).size > 1) {
    const exact = rows.filter((r) => r.seq === seq);
    if (exact.length) rows = exact;
  }
  return { rows: rows.sort((a, b) => a.etaSeq - b.etaSeq).slice(0, 3), fetchedAt: res.fetchedAt };
}

/** KMB: all routes at a stop in one call. */
export const getKmbStopEta = (stopId: string, force = false) => get(`${KMB_BASE}/stop-eta/${stopId}`, 'KMB', force);

/** KMB: all stops of a route in one call. */
export const getKmbRouteEta = (route: string, serviceType: number, force = false) =>
  get(`${KMB_BASE}/route-eta/${encodeURIComponent(route)}/${serviceType}`, 'KMB', force);
