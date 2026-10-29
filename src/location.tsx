// "Where am I?" — keeps the phone's GPS position up to date while the app is open,
// so every page can show the nearest stop and walking distance. The position stays
// in memory on the phone; it is never stored or sent anywhere by this app.
import { useEffect, useMemo } from 'react';
import { create } from 'zustand';
import { useSettings } from './store';
import { useT } from './i18n';
import { distance } from './utils/geo';

export type LocStatus = 'off' | 'asking' | 'ok' | 'rough' | 'denied' | 'unsupported' | 'error';

/** Only positions at least this accurate are used (metres). "Approximate location" on
 *  Android 12+/iOS 14+ is typically 1–3 km off and would point at the wrong stop. */
export const GOOD_ACCURACY = 300;
/** Ignore positions older than this — phones may hand back a saved one (e.g. from home). */
const MAX_FIX_AGE = 60_000;

interface LocState {
  /** the last GOOD position (accurate and fresh), or null */
  pos: { lat: number; lng: number; accuracy: number; at: number } | null;
  /** accuracy of the latest fix, even if it was too rough to use (metres) */
  lastAccuracy: number | null;
  status: LocStatus;
  /** bumped to retry after the user turns location back on */
  attempt: number;
  retry: () => void;
}

export const useLocation = create<LocState>()((set) => ({
  pos: null,
  lastAccuracy: null,
  status: 'off',
  attempt: 0,
  retry: () => set((s) => ({ attempt: s.attempt + 1, status: 'asking' })),
}));

// dev-only handle so a simulated position can be injected while testing
if (import.meta.env.DEV) (window as unknown as { __loc: typeof useLocation }).__loc = useLocation;

/** Mounted once in <App>: watches GPS while the app is visible and location is switched on. */
export function LocationWatcher() {
  const enabled = useSettings((s) => s.useLocation);
  const attempt = useLocation((s) => s.attempt);

  useEffect(() => {
    if (!enabled) {
      useLocation.setState({ status: 'off', pos: null });
      return;
    }
    if (!navigator.geolocation) {
      useLocation.setState({ status: 'unsupported' });
      return;
    }
    let id: number | null = null;
    const start = () => {
      if (id !== null) return;
      if (!useLocation.getState().pos) useLocation.setState({ status: 'asking' });
      id = navigator.geolocation.watchPosition(
        (p) => {
          const now = Date.now();
          const accuracy = p.coords.accuracy;
          const fresh = now - p.timestamp < MAX_FIX_AGE;
          if (fresh && accuracy <= GOOD_ACCURACY) {
            useLocation.setState({
              status: 'ok',
              lastAccuracy: accuracy,
              pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy, at: now },
            });
            return;
          }
          // too rough (approximate location / indoors) or an old saved position:
          // keep a recent good position if we have one, otherwise don't guess
          const cur = useLocation.getState().pos;
          const keepGood = cur && now - cur.at < 2 * MAX_FIX_AGE;
          useLocation.setState({
            lastAccuracy: accuracy,
            status: keepGood ? 'ok' : 'rough',
            pos: keepGood ? cur : null,
          });
        },
        (e) => useLocation.setState({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'error' }),
        // a position up to 10 s old is fine (fast first fix); anything older is ignored above
        { enableHighAccuracy: true, maximumAge: 10_000, timeout: 30000 },
      );
    };
    const stop = () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
      id = null;
    };
    // Keep ONE watch for the whole session. Stopping and restarting it every time the
    // app goes to the background makes some phones (iPhone home-screen apps) ask for
    // permission again. The phone pauses GPS by itself while the app isn't on screen.
    start();
    const onVis = () => {
      // only retry after a GPS glitch — never re-ask someone who said no
      if (!document.hidden && useLocation.getState().status === 'error') {
        stop();
        start();
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, attempt]);

  return null;
}

/** Metres from me to a point, or null when location is unknown. */
export function useDistanceTo(lat?: number, lng?: number): number | null {
  const pos = useLocation((s) => s.pos);
  if (!pos || lat === undefined || lng === undefined) return null;
  return Math.round(distance(pos.lat, pos.lng, lat, lng));
}

/**
 * Walking time from the straight-line distance. Real paths in Hong Kong (estates on hills,
 * footbridges, highways) are usually ~1.4x longer than a straight line; ~75 m per minute.
 */
export const walkMinutes = (m: number) => Math.max(1, Math.round((m * 1.4) / 75));

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} 米` : `${(m / 1000).toFixed(1)} 公里`);

/**
 * Google Maps walking directions to the stop. Opens the Google Maps app on phones that
 * have it, otherwise the website. When this app has a fresh, accurate position it is
 * passed as the start point: right after opening, Google Maps often still uses an old
 * saved "Your location" (the grey dot) and would route from the wrong place.
 */
export const mapsDirectionsUrl = (lat: number, lng: number, from?: { lat: number; lng: number } | null) =>
  `https://www.google.com/maps/dir/?api=1` +
  (from ? `&origin=${from.lat.toFixed(6)},${from.lng.toFixed(6)}` : '') +
  `&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`;

/** "🗺️ 帶我去" — walking directions in Google Maps. */
export function MapsButton({ lat, lng, compact }: { lat: number; lng: number; compact?: boolean }) {
  const t = useT();
  const pos = useLocation((s) => s.pos);
  // only a position from the last 2 minutes — otherwise let Google find you itself
  const from = pos && Date.now() - pos.at < 120_000 ? pos : null;
  return (
    <a
      className={`maps-btn ${compact ? 'compact' : ''}`}
      href={mapsDirectionsUrl(lat, lng, from)}
      target="_blank"
      rel="noopener"
      onClick={(e) => e.stopPropagation()}
      aria-label={t('loc.directions')}
    >
      🗺️ {compact ? t('loc.directionsShort') : t('loc.directions')}
    </a>
  );
}

/** "📍 230 米 · 步行約 3 分鐘" */
export function DistanceTag({ lat, lng, walk = true }: { lat?: number; lng?: number; walk?: boolean }) {
  const t = useT();
  const d = useDistanceTo(lat, lng);
  if (d === null) return null;
  return (
    <span className="distance-tag">
      📍 {t('loc.straight', { d: formatDistance(d) })}
      {walk && d <= 3000 && <> · {t('loc.walk', { m: walkMinutes(d) })}</>}
    </span>
  );
}

/** A friendly bar when location is off / blocked, with a way to fix it. */
export function LocationPrompt() {
  const t = useT();
  const status = useLocation((s) => s.status);
  const retry = useLocation((s) => s.retry);
  const enabled = useSettings((s) => s.useLocation);
  const lastAccuracy = useLocation((s) => s.lastAccuracy);
  if (status === 'ok' || status === 'asking') return null;
  if (status === 'rough') {
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    return (
      <div className="loc-prompt rough" role="status">
        <span>
          📍 {t('loc.rough', { d: lastAccuracy ? formatDistance(lastAccuracy) : '—' })}
          <small className="loc-help">{ios ? t('loc.preciseIOS') : t('loc.preciseAndroid')}</small>
        </span>
        <button className="pill-btn" onClick={retry}>
          {t('loc.retry')}
        </button>
      </div>
    );
  }
  return (
    <div className="loc-prompt" role="status">
      <span>📍 {status === 'denied' ? t('loc.denied') : status === 'unsupported' ? t('loc.unsupported') : t('loc.off')}</span>
      {status !== 'unsupported' && (
        <button
          className="pill-btn"
          onClick={() => {
            if (!enabled) useSettings.getState().set({ useLocation: true });
            else retry();
          }}
        >
          {t('loc.turnOn')}
        </button>
      )}
    </div>
  );
}

/**
 * Nearest stop to me on one route (by its ordered stop keys). Position is rounded to
 * ~20 m so the choice doesn't flicker between two stops as GPS wobbles.
 */
export function useNearestStop(keys: string[] | undefined, stops: Map<string, { lat: number; lng: number }> | undefined) {
  const pos = useLocation((s) => s.pos);
  const lat = pos ? Math.round(pos.lat * 5e3) / 5e3 : null;
  const lng = pos ? Math.round(pos.lng * 5e3) / 5e3 : null;
  return useMemo(() => {
    if (lat === null || lng === null || !keys || !stops) return null;
    let idx = -1;
    let best = Infinity;
    keys.forEach((k, i) => {
      const s = stops.get(k);
      if (!s) return;
      const d = distance(lat, lng, s.lat, s.lng);
      if (d < best) [idx, best] = [i, d];
    });
    return idx < 0 ? null : { idx, key: keys[idx], dist: Math.round(best) };
  }, [lat, lng, keys, stops]);
}
