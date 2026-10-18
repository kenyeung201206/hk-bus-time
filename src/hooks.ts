import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSettings, useUi } from './store';

/** Window event that makes every live ETA on screen refresh now (pull-to-refresh, ↻ button). */
export const REFRESH_EVENT = 'hkbus:refresh';
export const refreshAll = () => window.dispatchEvent(new Event(REFRESH_EVENT));

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

  const run = useCallback(async (force = false) => {
    const my = ++gen.current;
    setLoading(true);
    try {
      const v = await fnRef.current(force);
      if (my !== gen.current) return;
      setData(v);
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
    setError(false);
    if (!enabled) return;
    run();
    let timer = setInterval(() => !document.hidden && run(), refreshSec * 1000);
    const onVis = () => {
      if (!document.hidden) {
        run();
        clearInterval(timer);
        timer = setInterval(() => !document.hidden && run(), refreshSec * 1000);
      }
    };
    const onRefreshAll = () => run(true);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener(REFRESH_EVENT, onRefreshAll);
    return () => {
      clearInterval(timer);
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
