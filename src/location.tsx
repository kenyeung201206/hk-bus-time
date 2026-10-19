// "Where am I?" — keeps the phone's GPS position up to date while the app is open,
// so every page can show the nearest stop and walking distance. The position stays
// in memory on the phone; it is never stored or sent anywhere by this app.
import { useEffect } from 'react';
import { create } from 'zustand';
import { useSettings } from './store';
import { useT } from './i18n';
import { distance } from './utils/geo';

export type LocStatus = 'off' | 'asking' | 'ok' | 'denied' | 'unsupported' | 'error';

interface LocState {
  pos: { lat: number; lng: number; accuracy: number } | null;
  status: LocStatus;
  /** bumped to retry after the user turns location back on */
  attempt: number;
  retry: () => void;
}

export const useLocation = create<LocState>()((set) => ({
  pos: null,
  status: 'off',
  attempt: 0,
  retry: () => set((s) => ({ attempt: s.attempt + 1, status: 'asking' })),
}));

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
        (p) =>
          useLocation.setState({
            status: 'ok',
            pos: { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy },
          }),
        (e) => useLocation.setState({ status: e.code === e.PERMISSION_DENIED ? 'denied' : 'error' }),
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 },
      );
    };
    const stop = () => {
      if (id !== null) navigator.geolocation.clearWatch(id);
      id = null;
    };
    // save battery: only watch while the app is on screen
    const onVis = () => (document.hidden ? stop() : start());
    start();
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

/** About 80 m per minute at a normal walking pace. */
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 80));

export const formatDistance = (m: number) => (m < 1000 ? `${Math.round(m / 10) * 10} 米` : `${(m / 1000).toFixed(1)} 公里`);

/**
 * Google Maps walking directions from where you are to the stop. Opens the Google Maps
 * app on phones that have it, otherwise the website. Google uses the phone's own
 * location as the starting point; this app only passes the stop's coordinates.
 */
export const mapsDirectionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat.toFixed(6)},${lng.toFixed(6)}&travelmode=walking`;

/** "🗺️ 帶我去" — walking directions in Google Maps. */
export function MapsButton({ lat, lng, compact }: { lat: number; lng: number; compact?: boolean }) {
  const t = useT();
  return (
    <a
      className={`maps-btn ${compact ? 'compact' : ''}`}
      href={mapsDirectionsUrl(lat, lng)}
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
      📍 {formatDistance(d)}
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
  if (status === 'ok' || status === 'asking') return null;
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
