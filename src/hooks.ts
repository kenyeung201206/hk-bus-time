import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettings, useUi } from './store';

/** Window event that makes every live ETA on screen refresh now (pull-to-refresh, ↻ button). */
export const REFRESH_EVENT = 'hkbus:refresh';
export const refreshAll = () => window.dispatchEvent(new Event(REFRESH_EVENT));

const FAST_MS = 10_000;
/** True when an ETA result has a bus due within 3 minutes (or at the stop now). */
function busIsClose(v: unknown): boolean {
  const res = v as { rows?: { eta: Date | null }[] } | undefined;
  if (!res?.rows) return false;
  const now = Date.now();
  return res.rows.some((r) => r.eta && r.eta.getTime() - now < 180_000 && r.eta.getTime() - now > -120_000);
}

/**
 * Runs `fn` now and every refresh interval while the page is visible.
 * Keeps the last good value when a refresh fails.
 */
export function usePolling<T>(fn: (force: boolean) => Promise<T>, deps: unknown[], enabled = true) {
  const refreshSec = useSettings((s) => s.refreshSec);
  const [data, setData] = useState<T | undefined>();
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const gen = useRef(0);
  const lastData = useRef<T | undefined>(undefined);

  const run = useCallback(async (force = false) => {
    const my = ++gen.current;
    setLoading(true);
    try {
      const v = await fnRef.current(force);
      if (my !== gen.current) return;
      setData(v);
      lastData.current = v;
      setError(false);
      setUpdatedAt(Date.now());
      useUi.getState().markUpdated();
    } catch {
      if (my === gen.current) setError(true);
    } finally {
      if (my === gen.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    setData(undefined);
    lastData.current = undefined;
    setError(false);
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    // refresh every `refreshSec`, or every 10 s while a bus is within 3 minutes,
    // so "已經到站" / "就嚟到站" switch over close to when it really happens
    const loop = async (force = false) => {
      clearTimeout(timer);
      await run(force);
      if (!alive) return;
      const next = busIsClose(lastData.current) ? FAST_MS : refreshSec * 1000;
      timer = setTimeout(() => (document.hidden ? schedule() : loop()), next);
    };
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => (document.hidden ? schedule() : loop()), refreshSec * 1000);
    };
    loop();
    const onVis = () => !document.hidden && loop();
    const onRefreshAll = () => loop(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(REFRESH_EVENT, onRefreshAll);
    return () => {
      alive = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener(REFRESH_EVENT, onRefreshAll);
      gen.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, refreshSec]);

  return { data, error, loading, updatedAt, reload: () => run(true) };
}

/** Re-render every `ms` (for "updated 12 s ago" and minute countdowns). */
export function useNow(ms = 5000) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener('online', cb);
  window.addEventListener('offline', cb);
  return () => {
    window.removeEventListener('online', cb);
    window.removeEventListener('offline', cb);
  };
};
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine);

/** Fire `cb` after holding a pointer for 600 ms. */
export function useLongPress(cb: () => void) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const fired = useRef(false);
  const cancel = () => clearTimeout(timer.current);
  return {
    handlers: {
      onPointerDown: () => {
        fired.current = false;
        timer.current = setTimeout(() => {
          fired.current = true;
          cb();
        }, 600);
      },
      onPointerUp: cancel,
      onPointerLeave: cancel,
      onPointerCancel: cancel,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
    /** true if the last press was a long press (so click handlers can ignore it) */
    wasLong: () => fired.current,
  };
}
