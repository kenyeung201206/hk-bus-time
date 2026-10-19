import { useEffect, useState } from 'react';
import { alertKey, useAlerts, useSettings, useUi, type BusAlert } from '../store';
import { getArrivals } from '../api/eta';
import { minutesUntil } from '../utils/time';
import { useT } from '../i18n';
import { BellIcon, BusIcon } from '../components/icons';
import { nextAnnouncement, reminderMarks } from './schedule';
import { prefetchClips, sayArmed, sayMinutes } from './voice';
import type { Company, Dir } from '../types';

const CHECK_MS = 20_000;
const MAX_AGE = 3 * 3600_000; // forget a reminder after 3 hours

/**
 * Lives in <App>. Checks every armed reminder's live ETA every 20 s — on every
 * page — and speaks when the bus crosses the next minute mark.
 */
export function AlertManager() {
  const t = useT();
  const alerts = useAlerts((s) => s.alerts);
  const { alertsOn, voice, keepAwake } = useSettings();
  const showToast = useUi((s) => s.showToast);
  const [mins, setMins] = useState<Record<string, number | null>>({});

  const active = alertsOn && alerts.length > 0;

  useEffect(() => {
    if (!active) return;
    let stopped = false;
    const check = async () => {
      const { alerts: list, update, disarm } = useAlerts.getState();
      for (const a of list) {
        const key = alertKey(a);
        if (Date.now() - a.createdAt > MAX_AGE) {
          disarm(key);
          continue;
        }
        try {
          const res = await getArrivals(a.co, a.route, a.dir, a.serviceType, a.stopId, a.seq);
          const first = res.rows.find((r) => r.eta);
          const m = first ? minutesUntil(first.eta!, first.dataTimestamp, res.fetchedAt) : null;
          if (stopped) return;
          setMins((x) => ({ ...x, [key]: m }));
          if (m === null) continue;
          const { speak, pending } = nextAnnouncement(a.pending, m);
          if (speak === null) continue;
          sayMinutes(useSettings.getState().voice, speak); // queued: never talks over itself
          showToast(t('alert.toast', { r: a.route, m: speak }));
          if (pending.length) update(key, { pending, lastSaid: speak });
          else disarm(key);
        } catch {
          /* network blip: try again next round */
        }
      }
    };
    check();
    const id = setInterval(check, CHECK_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
    // re-run when reminders are added/removed (not on every pending update)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, alerts.length, voice]);

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
        <AlertChip key={a.id} a={a} minutes={mins[alertKey(a)]} />
      ))}
    </div>
  );
}

function AlertChip({ a, minutes }: { a: BusAlert; minutes: number | null | undefined }) {
  const t = useT();
  const disarm = useAlerts((s) => s.disarm);
  const next = a.pending[0];
  return (
    <div className="alert-chip">
      <BellIcon on size={18} />
      <BusIcon co={a.co} size={24} />
      <b>{a.route}</b>
      <span className="alert-text">
        {minutes === undefined
          ? t('alert.checking')
          : minutes === null
            ? t('noInfo')
            : t('alert.status', { m: minutes, n: next })}
      </span>
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
