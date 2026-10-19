// HK Bus Time push server.
//   POST   /alerts      { subscription, co, route, dir, serviceType, stopId, seq, stopName, marks } → { id }
//   DELETE /alerts/:id  cancel
//   GET    /vapid       VAPID public key
// Each reminder gets its own Durable Object ("AlertTimer") that wakes itself with alarms,
// checks the live ETA, and sends a lock-screen notification the moment the minute shown
// reaches a reminder mark — then 「已經到站」 when the arrival time passes.
import { DurableObject } from 'cloudflare:workers';
import { sendPush, type PushSubscriptionJSON } from './webpush';

export interface Env {
  ALERTS: DurableObjectNamespace<AlertTimer>;
  ALLOWED_ORIGINS: string;
  VAPID_SUBJECT: string;
  VAPID_PUBLIC_KEY: string;
  VAPID_PRIVATE_KEY: string;
}

interface AlertState {
  sub: PushSubscriptionJSON;
  co: 'KMB' | 'CTB';
  route: string;
  dir: 'O' | 'I';
  serviceType: number;
  stopId: string;
  seq: number;
  stopName: string;
  pending: number[];
  createdAt: number;
  eta: number | null; // ms, device-clock corrected
  fetchedAt: number;
}

const KMB = 'https://data.etabus.gov.hk/v1/transport/kmb';
const CTB = 'https://rt.data.gov.hk/v2/transport/citybus';
const MAX_AGE = 3 * 3600_000;
const AT_STOP = 120_000; // a bus more than 2 min past its time has left

const DIGITS = '一二三四五六七八九';
function zhNumber(n: number): string {
  if (n === 2) return '兩';
  if (n < 10) return DIGITS[n - 1];
  if (n === 10) return '十';
  const t = Math.floor(n / 10);
  const u = n % 10;
  if (t === 1) return '十' + DIGITS[u - 1];
  if (t === 2 && u) return '廿' + DIGITS[u - 1];
  if (t >= 10) return String(n);
  return DIGITS[t - 1] + '十' + (u ? DIGITS[u - 1] : '');
}

export class AlertTimer extends DurableObject<Env> {
  async start(state: Omit<AlertState, 'createdAt' | 'eta' | 'fetchedAt'>) {
    await this.ctx.storage.put('s', { ...state, createdAt: Date.now(), eta: null, fetchedAt: 0 } satisfies AlertState);
    await this.ctx.storage.setAlarm(Date.now() + 500);
  }

  async stop() {
    await this.ctx.storage.deleteAlarm();
    await this.ctx.storage.deleteAll();
  }

  private async fetchEta(s: AlertState): Promise<number | null> {
    const url =
      s.co === 'KMB'
        ? `${KMB}/eta/${s.stopId}/${encodeURIComponent(s.route)}/${s.serviceType}`
        : `${CTB}/eta/CTB/${s.stopId}/${encodeURIComponent(s.route)}`;
    // the government CDN blocks requests that don't look like a browser
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (HK Bus Time push)', Accept: 'application/json' } });
    if (!res.ok) throw new Error(String(res.status));
    const json = (await res.json()) as { data?: any[] };
    let rows = (json.data ?? []).filter((r) => r.dir === s.dir && (s.co === 'CTB' || +r.service_type === s.serviceType));
    if (new Set(rows.map((r) => +r.seq)).size > 1) rows = rows.filter((r) => +r.seq === s.seq);
    const now = Date.now();
    for (const r of rows.sort((a, b) => a.eta_seq - b.eta_seq)) {
      if (!r.eta) continue;
      const eta = Date.parse(r.eta);
      if (eta > now - AT_STOP) return eta;
    }
    return null;
  }

  private async notify(s: AlertState, title: string) {
    const status = await sendPush(
      s.sub,
      { title, body: s.stopName, tag: `bus-${s.co}-${s.route}-${s.dir}-${s.stopId}` },
      { publicKey: this.env.VAPID_PUBLIC_KEY, privateKey: this.env.VAPID_PRIVATE_KEY, subject: this.env.VAPID_SUBJECT },
    );
    if (status === 404 || status === 410) throw new Error('gone');
  }

  async alarm() {
    const s = await this.ctx.storage.get<AlertState>('s');
    if (!s) return;
    const now = Date.now();
    if (now - s.createdAt > MAX_AGE) return this.stop();

    const close = s.eta !== null && s.eta - now < 240_000;
    if (now - s.fetchedAt >= (close ? 10_000 : 25_000)) {
      try {
        s.eta = await this.fetchEta(s);
        s.fetchedAt = now;
      } catch {
        /* keep counting down on the last good time */
      }
    }

    try {
      if (s.eta === null) {
        await this.ctx.storage.put('s', s);
        await this.ctx.storage.setAlarm(now + 30_000);
        return;
      }
      const sec = (s.eta - now) / 1000;
      if (sec <= 0) {
        await this.notify(s, `🚏 ${s.route} 已經到站！快啲上車！`);
        return this.stop();
      }
      const m = Math.floor(sec / 60);
      if (s.pending.some((p) => m <= p)) {
        await this.notify(s, `🔔 ${s.route} 仲有${zhNumber(Math.max(1, m))}分鐘就到！`);
        s.pending = s.pending.filter((p) => p < m);
      }
      // wake exactly when the shown minute reaches the next mark (or at arrival),
      // and in between often enough to follow ETA changes
      const next = s.pending.length ? Math.max(...s.pending) : null;
      const markAt = next !== null ? s.eta - (next + 1) * 60_000 + 300 : s.eta + 300;
      const refreshAt = s.fetchedAt + (s.eta - now < 240_000 ? 10_000 : 25_000);
      await this.ctx.storage.put('s', s);
      await this.ctx.storage.setAlarm(Math.max(now + 1000, Math.min(markAt, refreshAt)));
    } catch {
      return this.stop(); // subscription gone or broken
    }
  }
}

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS.split(',').map((x) => x.trim());
  return {
    'Access-Control-Allow-Origin': origin && allowed.includes(origin) ? origin : allowed[0],
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

const json = (data: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const h = cors(req.headers.get('Origin'), env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });

    if (req.method === 'GET' && url.pathname === '/vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY }, 200, h);

    // health check: can this server read the live bus times? (public data only)
    if (req.method === 'GET' && url.pathname === '/check') {
      const targets = [
        `${KMB}/eta/A3ADFCDF8487ADB9/1A/1`,
        `${CTB}/eta/CTB/001027/1`,
      ];
      const results = await Promise.all(
        targets.map(async (t) => {
          try {
            const r = await fetch(t, { headers: { 'User-Agent': 'Mozilla/5.0 (HK Bus Time push)', Accept: 'application/json' } });
            const body = r.ok ? ((await r.json()) as { data?: unknown[] }) : null;
            return { url: t, status: r.status, rows: body?.data?.length ?? null };
          } catch (e) {
            return { url: t, error: String(e) };
          }
        }),
      );
      return json(results, 200, h);
    }

    if (req.method === 'POST' && url.pathname === '/alerts') {
      let b: any;
      try {
        b = await req.json();
      } catch {
        return json({ error: 'bad json' }, 400, h);
      }
      const ok =
        b?.subscription?.endpoint?.startsWith('https://') &&
        b.subscription.keys?.p256dh &&
        b.subscription.keys?.auth &&
        (b.co === 'KMB' || b.co === 'CTB') &&
        typeof b.route === 'string' &&
        b.route.length <= 6 &&
        (b.dir === 'O' || b.dir === 'I') &&
        typeof b.stopId === 'string' &&
        Array.isArray(b.marks) &&
        b.marks.length <= 60 &&
        b.marks.every((m: unknown) => Number.isInteger(m) && (m as number) >= 1 && (m as number) <= 180);
      if (!ok) return json({ error: 'invalid reminder' }, 400, h);
      const id = env.ALERTS.newUniqueId();
      await env.ALERTS.get(id).start({
        sub: b.subscription,
        co: b.co,
        route: b.route,
        dir: b.dir,
        serviceType: +b.serviceType || 1,
        stopId: b.stopId,
        seq: +b.seq || 0,
        stopName: String(b.stopName ?? '').slice(0, 40),
        pending: [...new Set<number>(b.marks)].sort((x, y) => y - x),
      });
      return json({ id: id.toString() }, 201, h);
    }

    const del = url.pathname.match(/^\/alerts\/([0-9a-f]{64})$/);
    if (req.method === 'DELETE' && del) {
      await env.ALERTS.get(env.ALERTS.idFromString(del[1])).stop();
      return new Response(null, { status: 204, headers: h });
    }

    return json({ error: 'not found' }, 404, h);
  },
};
