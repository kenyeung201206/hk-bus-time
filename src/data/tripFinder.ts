import type { BusIndex } from './busIndex';
import type { Route, Stop } from '../types';

export interface Candidate {
  stop: Stop;
  /** walking distance in metres when the origin came from GPS */
  walk?: number;
}

export interface TripResult {
  route: Route;
  board: Stop;
  alight: Stop;
  boardIdx: number;
  alightIdx: number;
  stops: number;
  walk?: number;
  /** other service types / directions of the same route that also work */
  others: Route[];
}

export const MAX_CANDIDATES = 400;
/** Many stops are named after the street, not the area (銅鑼灣 → 軒尼詩道), so a place
 *  also includes stops within this distance of a stop whose name matches. */
export const AREA_RADIUS = 250;

/** Candidate stops for a typed place name: stops whose name contains the text, plus their neighbours. */
export function candidatesByName(index: BusIndex, text: string, radius = AREA_RADIUS): Candidate[] {
  const named = index.stopsMatching(text, MAX_CANDIDATES);
  const out = new Map<string, Candidate>(named.map((stop) => [stop.key, { stop }]));
  if (radius > 0) {
    for (const s of named) {
      for (const n of index.stopsNear(s.lat, s.lng, radius)) {
        if (out.size >= MAX_CANDIDATES) break;
        if (!out.has(n.key)) out.set(n.key, { stop: n });
      }
    }
  }
  return [...out.values()];
}

export function candidatesNear(index: BusIndex, lat: number, lng: number, radius = 400): Candidate[] {
  return index
    .stopsNear(lat, lng, radius)
    .slice(0, MAX_CANDIDATES)
    .map((s) => ({ stop: s, walk: Math.round(s.dist) }));
}

/**
 * Direct buses: a route with a boarding stop o ∈ O and an alighting stop d ∈ D
 * on the same route/direction/service type where d comes after o.
 */
export function findDirect(index: BusIndex, origins: Candidate[], dests: Candidate[]): TripResult[] {
  const destKeys = new Set(dests.map((d) => d.stop.key));
  const best = new Map<string, TripResult>(); // routeId -> best pair

  for (const o of origins) {
    if (destKeys.has(o.stop.key)) continue;
    for (const { routeId, idx } of index.stopRoutes.get(o.stop.key) ?? []) {
      const keys = index.routeStops.get(routeId)!;
      // first later stop that is a destination = fewest stops for this boarding point
      // (circular routes: each occurrence of o is its own entry in stopRoutes)
      for (let j = idx + 1; j < keys.length; j++) {
        if (!destKeys.has(keys[j])) continue;
        const stops = j - idx;
        const cur = best.get(routeId);
        if (!cur || stops < cur.stops || (stops === cur.stops && (o.walk ?? 0) < (cur.walk ?? 0))) {
          best.set(routeId, {
            route: index.routeById.get(routeId)!,
            board: o.stop,
            alight: index.stops.get(keys[j])!,
            boardIdx: idx,
            alightIdx: j,
            stops,
            walk: o.walk,
            others: [],
          });
        }
        break;
      }
    }
  }

  // merge service types / directions of the same company+route
  const merged = new Map<string, TripResult>();
  for (const r of best.values()) {
    const k = `${r.route.co}-${r.route.route}`;
    const cur = merged.get(k);
    if (!cur) {
      merged.set(k, r);
    } else if (r.stops < cur.stops || (r.stops === cur.stops && r.route.serviceType < cur.route.serviceType)) {
      merged.set(k, { ...r, others: [...cur.others, cur.route] });
    } else {
      cur.others.push(r.route);
    }
  }
  return [...merged.values()];
}

export type TripSort = 'fast' | 'stops' | 'walk';

/** `soonest` = minutes until next bus for a result (undefined while loading). */
export function sortTrips(list: TripResult[], sort: TripSort, soonest: (r: TripResult) => number | undefined) {
  const walk = (r: TripResult) => r.walk ?? 0;
  const soon = (r: TripResult) => {
    const m = soonest(r);
    return m === undefined ? 999 : m;
  };
  const cmp: Record<TripSort, (a: TripResult, b: TripResult) => number> = {
    // (a) bus within 30 min first, then fewer stops, then shorter walk
    fast: (a, b) =>
      Number(soon(a) > 30) - Number(soon(b) > 30) || soon(a) + a.stops * 1.5 - (soon(b) + b.stops * 1.5) || walk(a) - walk(b),
    stops: (a, b) => a.stops - b.stops || walk(a) - walk(b),
    walk: (a, b) => walk(a) - walk(b) || a.stops - b.stops,
  };
  return [...list].sort(cmp[sort]);
}

export const MY_LOCATION = '📍';

/** Text inputs → direct results. `from` may be MY_LOCATION when `pos` is given. */
export function planTrip(index: BusIndex, from: string, to: string, pos?: { lat: number; lng: number }) {
  const O = from === MY_LOCATION && pos ? candidatesNear(index, pos.lat, pos.lng) : candidatesByName(index, from);
  const D = candidatesByName(index, to);
  return { O, D, results: O.length && D.length ? findDirect(index, O, D) : [] };
}

export const rideMinutes =(stops: number) => Math.max(1, Math.round(stops * 1.5));
