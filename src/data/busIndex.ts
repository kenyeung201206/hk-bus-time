import type { BusData, Company, Dir, Route, Stop } from '../types';
import { distance } from '../utils/geo';

export interface RouteGroup {
  co: Company;
  route: string;
  /** main (lowest service type) route per direction, outbound first */
  main: Route[];
}

export interface StopOnRoute {
  routeId: string;
  /** 0-based position in the route's stop list */
  idx: number;
}

/** KMB stop names often end with a stop code like "(KT975)" — hide it in the UI. */
export const cleanName = (s: string) => s.replace(/\s*\([A-Z]{2}\d{2,4}[A-Za-z]?\)\s*$/, '');

const routeCmp = (a: string, b: string) => {
  const na = parseInt(a.replace(/^\D+/, ''), 10) || 0;
  const nb = parseInt(b.replace(/^\D+/, ''), 10) || 0;
  const pa = a.match(/^\D*/)![0];
  const pb = b.match(/^\D*/)![0];
  if (pa !== pb) return pa < pb ? -1 : 1;
  return na - nb || a.localeCompare(b);
};

export class BusIndex {
  routes: Route[] = [];
  routeById = new Map<string, Route>();
  stops = new Map<string, Stop>();
  routeStops = new Map<string, string[]>(); // routeId -> stop keys
  stopRoutes = new Map<string, StopOnRoute[]>(); // stop key -> routes
  generatedAt: string;

  constructor(data: BusData) {
    this.generatedAt = data.generatedAt;
    for (const [key, [nameTc, nameEn, nameSc, lat, lng]] of Object.entries(data.stops)) {
      const dash = key.indexOf('-');
      this.stops.set(key, {
        key,
        co: key.slice(0, dash) as Company,
        stopId: key.slice(dash + 1),
        nameTc: cleanName(nameTc ?? ''),
        nameEn: cleanName(nameEn ?? ''),
        nameSc: cleanName(nameSc ?? ''),
        lat,
        lng,
      });
    }
    for (const [co, route, dir, serviceType, origTc, destTc, origEn, destEn, origSc, destSc] of data.routes) {
      const id = `${co}-${route}-${dir}-${serviceType}`;
      const stopIds = data.routeStops[id];
      if (!stopIds?.length) continue;
      const r: Route = { id, co, route, dir, serviceType, origTc, destTc, origEn, destEn, origSc: origSc ?? '', destSc: destSc ?? '' };
      this.routes.push(r);
      this.routeById.set(id, r);
      const keys = stopIds.map((s) => `${co}-${s}`);
      this.routeStops.set(id, keys);
      keys.forEach((k, idx) => {
        let list = this.stopRoutes.get(k);
        if (!list) this.stopRoutes.set(k, (list = []));
        list.push({ routeId: id, idx });
      });
    }
  }

  getRoute(co: string, route: string, dir: string, st: number) {
    return this.routeById.get(`${co}-${route}-${dir}-${st}`);
  }

  /** All service types of a route in one direction, main first. */
  variants(co: Company, route: string, dir: Dir) {
    return this.routes
      .filter((r) => r.co === co && r.route === route && r.dir === dir)
      .sort((a, b) => a.serviceType - b.serviceType);
  }

  /** Prefix match on route number ("10" → 10, 101, 102…), plus destination text match. */
  searchRoutes(q: string, limit = 60): RouteGroup[] {
    const query = q.trim().toUpperCase();
    if (!query) return [];
    const groups = new Map<string, Route[]>();
    const textMatch = !/^[A-Z]?\d/.test(query) || query.length > 4;
    for (const r of this.routes) {
      const hit =
        r.route.toUpperCase().startsWith(query) ||
        (textMatch && (r.destTc.includes(q) || r.destSc.includes(q) || r.destEn.toUpperCase().includes(query)));
      if (!hit) continue;
      const k = `${r.co}-${r.route}`;
      (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    const out: RouteGroup[] = [];
    for (const list of groups.values()) {
      const byDir = new Map<Dir, Route>();
      for (const r of list) {
        const cur = byDir.get(r.dir);
        if (!cur || r.serviceType < cur.serviceType) byDir.set(r.dir, r);
      }
      const main = [...byDir.values()].sort((a, b) => (a.dir === 'O' ? -1 : 1) - (b.dir === 'O' ? -1 : 1));
      out.push({ co: list[0].co, route: list[0].route, main });
    }
    out.sort((a, b) => {
      const ea = a.route.toUpperCase() === query ? 0 : 1;
      const eb = b.route.toUpperCase() === query ? 0 : 1;
      return ea - eb || routeCmp(a.route, b.route) || (a.co < b.co ? -1 : 1);
    });
    return out.slice(0, limit);
  }

  /** Stops whose Traditional / Simplified / English name contains the text. */
  stopsMatching(text: string, limit = Infinity): Stop[] {
    const q = text.trim();
    if (!q) return [];
    const qu = q.toUpperCase();
    const out: Stop[] = [];
    for (const s of this.stops.values()) {
      if (!this.stopRoutes.has(s.key)) continue;
      if (s.nameTc.includes(q) || s.nameSc.includes(q) || s.nameEn.toUpperCase().includes(qu)) {
        out.push(s);
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  /** Autocomplete: unique stop names that match, shortest / earliest match first. */
  suggestNames(text: string, limit = 8): string[] {
    const q = text.trim();
    if (!q) return [];
    const names = new Map<string, number>();
    for (const s of this.stopsMatching(q)) {
      const pos = s.nameTc.indexOf(q);
      const score = (pos < 0 ? 50 : pos) * 100 + s.nameTc.length;
      const cur = names.get(s.nameTc);
      if (cur === undefined || score < cur) names.set(s.nameTc, score);
    }
    return [...names.entries()].sort((a, b) => a[1] - b[1]).slice(0, limit).map((x) => x[0]);
  }

  stopsNear(lat: number, lng: number, radius: number): (Stop & { dist: number })[] {
    const out: (Stop & { dist: number })[] = [];
    // quick bounding box reject before haversine
    const dLat = radius / 111000;
    const dLng = radius / (111000 * Math.cos((lat * Math.PI) / 180));
    for (const s of this.stops.values()) {
      if (Math.abs(s.lat - lat) > dLat || Math.abs(s.lng - lng) > dLng) continue;
      if (!this.stopRoutes.has(s.key)) continue;
      const dist = distance(lat, lng, s.lat, s.lng);
      if (dist <= radius) out.push({ ...s, dist });
    }
    return out.sort((a, b) => a.dist - b.dist);
  }

  routesAtStop(stopKey: string): { route: Route; idx: number }[] {
    return (this.stopRoutes.get(stopKey) ?? [])
      .map((x) => ({ route: this.routeById.get(x.routeId)!, idx: x.idx }))
      .sort((a, b) => routeCmp(a.route.route, b.route.route) || a.route.serviceType - b.route.serviceType);
  }
}
