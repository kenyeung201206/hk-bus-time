import { VoicePicker } from './VoicePicker';
import { useEffect, useRef, useState } from 'react';
import { alertKey, useAlerts, useSettings, useUi, type BusAlert } from '../store';
import { getArrivals } from '../api/eta';
import { busPhase, secondsUntil } from '../utils/time';
import { useT } from '../i18n';
import { BellIcon, BusIcon } from '../components/icons';
import { nextAnnouncement, reminderMarks } from './schedule';
import { keepAlive, prefetchClips, sayArmed, sayArrived, sayMinutes } from './voice';
import type { Company, Dir } from '../types';

const MAX_AGE = 3 * 3600_000; // forget a reminder after 3 hours

interface Latest {
  eta: Date;
  ts: Date;
  fetchedAt: number;
}

/** First bus that hasn't left yet (arrival time not more than 2 minutes ago). */
function nextBus(res: Awaited<ReturnType<typeof getArrivals>>): Latest | null {
  for (const r of res.rows) {
    if (!r.eta) continue;
    if (busPhase(secondsUntil(r.eta, r.dataTimestamp, res.fetchedAt)) === 'gone') continue;
    return { eta: r.eta, ts: r.dataTimestamp, fetchedAt: res.fetchedAt };
  }
  return null;
}

/**
 * Lives in <App>, on every page. Two loops:
 *  - fetch: live ETA for each reminder every 20 s (every 10 s once a bus is within 4 min)
 *  - tick:  every second, counts down on the phone itself and speaks the moment the
 *           minute shown changes onto a reminder mark — then 「已經到站」 when it arrives.
 */
export function AlertManager() {
  const t = useT();
  const alerts = useAlerts((s) => s.alerts);
  const { alertsOn, keepAwake } = useSettings();
  const showToast = useUi((s) => s.showToast);
  const [secs, setSecs] = useState<Record<string, number | null>>({});
  const latest = useRef<Record<string, Latest | null>>({});

  const active = alertsOn && alerts.length > 0;

  // keep sound running in the background while waiting (stops phones pausing the app)
  useEffect(() => {
    keepAlive(active, alerts[0] ? `${alerts[0].route} · ${alerts[0].stopName}` : '');
  }, [active, alerts]);

  // fetch loop
  useEffect(() => {
    if (!active) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fetchAll = async () => {
      const { alerts: list, disarm } = useAlerts.getState();
      for (const a of list) {
        const key = alertKey(a);
        if (Date.now() - a.createdAt > MAX_AGE) {
          disarm(key);
          continue;
        }
        try {
          const res = await getArrivals(a.co, a.route, a.dir, a.serviceType, a.stopId, a.seq, true);
          latest.current[key] = nextBus(res);
        } catch {
          /* network blip: keep counting down on the last good time */
        }
      }
      if (stopped) return;
      const close = Object.values(latest.current).some(
        (l) => l && secondsUntil(l.eta, l.ts, l.fetchedAt) < 240,
      );
      timer = setTimeout(fetchAll, close ? 10_000 : 20_000);
    };
    fetchAll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [active, alerts.length]);

  // one-second tick
  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const { alerts: list, update, disarm } = useAlerts.getState();
      const voice = useSettings.getState().voice;
      const next: Record<string, number | null> = {};
      for (const a of list) {
        const key = alertKey(a);
        const l = latest.current[key];
        if (l === undefined) continue; // first fetch not back yet
        if (l === null) {
          next[key] = null;
          continue;
        }
        const sec = secondsUntil(l.eta, l.ts, l.fetchedAt);
        next[key] = sec;
        if (busPhase(sec) === 'arrived') {
          sayArrived(voice);
          showToast(t('alert.arrivedToast', { r: a.route }));
          disarm(key);
          delete latest.current[key];
          continue;
        }
        if (!a.pending.length) continue; // all marks said; now waiting for arrival
        const { speak, pending } = nextAnnouncement(a.pending, Math.floor(sec / 60));
        if (speak === null) continue;
        sayMinutes(voice, speak); // queued: never talks over itself
        showToast(t('alert.toast', { r: a.route, m: speak }));
        update(key, { pending, lastSaid: speak });
      }
      setSecs(next);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // keep the screen on while waiting, so the phone can still talk
  useEffect(() => {
    if (!active || !keepAwake || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    const get = async () => {
      try {
        lock = await navigator.wakeLock.request('screen');
      } catch {
        /* not allowed (battery saver etc.) */
      }
    };
    get();
    const onVis = () => !document.hidden && get();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release().catch(() => {});
    };
  }, [active, keepAwake]);

  if (!active) return null;
  return (
    <div className="alert-bar" role="status">
      {alerts.map((a) => (
        <AlertChip key={a.id} a={a} seconds={secs[alertKey(a)]} />
      ))}
    </div>
  );
}

function AlertChip({ a, seconds }: { a: BusAlert; seconds: number | null | undefined }) {
  const t = useT();
  const disarm = useAlerts((s) => s.disarm);
  const next = a.pending[0];
  let text: string;
  if (seconds === undefined) text = t('alert.checking');
  else if (seconds === null) text = t('noInfo');
  else if (busPhase(seconds) === 'arriving') text = t('arriving');
  else {
    const m = Math.floor(seconds / 60);
    text = next !== undefined ? t('alert.status', { m, n: next }) : t('alert.statusWait', { m });
  }
  return (
    <div className="alert-chip">
      <BellIcon on size={18} />
      <BusIcon co={a.co} size={24} />
      <b>{a.route}</b>
      <span className="alert-text">{text}</span>
      <button className="icon-btn small" onClick={() => disarm(alertKey(a))} aria-label={t('alert.cancel')}>
        ✕
      </button>
    </div>
  );
}

interface BellProps {
  co: Company;
  route: string;
  dir: Dir;
  serviceType: number;
  stopId: string;
  seq: number;
  stopName: string;
}

/** 🔔 button on a favourite card or a stop in the route page. */
export function AlertBell(props: BellProps) {
  const t = useT();
  const key = alertKey(props);
  const armed = useAlerts((s) => s.alerts.some((x) => alertKey(x) === key));
  const alertsOn = useSettings((s) => s.alertsOn);
  const disarm = useAlerts((s) => s.disarm);
  const showToast = useUi((s) => s.showToast);
  const [open, setOpen] = useState(false);
  const on = armed && alertsOn;

  return (
    <>
      <button
        className={`bell-btn ${on ? 'on' : ''}`}
        aria-pressed={on}
        aria-label={on ? t('alert.cancel') : t('alert.set')}
        onClick={(e) => {
          e.stopPropagation();
          if (on) {
            disarm(key);
            showToast(t('alert.cancelled'));
            return;
          }
          if (!alertsOn) {
            if (!confirm(t('alert.enableAsk'))) return;
            useSettings.getState().set({ alertsOn: true });
          }
          setOpen(true);
        }}
      >
        <BellIcon on={on} />
      </button>
      {open && <AlertSheet {...props} onClose={() => setOpen(false)} />}
    </>
  );
}

const QUICK = [5, 10, 15, 20, 30];

function AlertSheet({ onClose, ...bus }: BellProps & { onClose: () => void }) {
  const t = useT();
  const settings = useSettings();
  const arm = useAlerts((s) => s.arm);
  const showToast = useUi((s) => s.showToast);
  const [start, setStart] = useState(settings.alertStart);
  const [step, setStep] = useState(settings.alertStep);
  const valid = Number.isFinite(start) && start >= 1;
  const marks = valid ? reminderMarks(start, step) : [];

  const go = () => {
    if (!valid) return;
    arm({ ...bus, marks });
    settings.set({ alertStart: start, alertStep: step });
    sayArmed(settings.voice); // runs inside the tap, which unlocks sound on iPhone
    prefetchClips(settings.voice, marks);
    showToast(t('alert.armed'));
    onClose();
  };

  return (
    <div className="sheet-backdrop" onClick={(e) => (e.stopPropagation(), onClose())}>
      <div className="sheet card" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <BusIcon co={bus.co} size={44} />
          <div>
            <b className="route-no small">{bus.route}</b>
            <div className="muted small">{bus.stopName}</div>
          </div>
        </div>
        <h2 className="section-title">{t('alert.startQ')}</h2>
        <div className="chips">
          {QUICK.map((q) => (
            <button key={q} className={`chip-btn ${start === q ? 'active' : ''}`} onClick={() => setStart(q)}>
              {q} {t('min')}
            </button>
          ))}
        </div>
        <label className="custom-min">
          {t('alert.custom')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={Number.isFinite(start) ? start : ''}
            onChange={(e) => setStart(parseInt(e.target.value, 10))}
          />
          {t('min')}
        </label>
        <h2 className="section-title">{t('alert.stepQ')}</h2>
        <div className="seg">
          {[1, 2, 3, 4, 5].map((s) => (
            <button key={s} className={step === s ? 'active' : ''} onClick={() => setStep(s)}>
              {s} {t('min')}
            </button>
          ))}
        </div>
        <h2 className="section-title">{t('settings.voice')}</h2>
        <VoicePicker />
        {valid && <p className="alert-preview">🗣️ {t('alert.preview', { list: marks.join('、') })}</p>}
        <button className="big-btn" onClick={go} disabled={!valid}>
          🔔 {t('alert.start')}
        </button>
        <button className="link-btn" onClick={onClose}>
          {t('cancel')}
        </button>
      </div>
    </div>
  );
}
