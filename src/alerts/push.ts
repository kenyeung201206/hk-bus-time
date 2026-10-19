// Lock-screen reminders through the HK Bus Time push server (Cloudflare Worker).
// The web page itself is frozen when the phone is locked, so the server counts down
// and sends a notification at each reminder mark. Used on iPhone (iOS 16.4+, added to
// Home Screen) and on Android browsers; the Android app speaks instead.
import { useAlerts, type BusAlert } from '../store';
import { isNativeApp } from './native';

const PUSH_URL = (import.meta.env.VITE_PUSH_URL as string | undefined)?.replace(/\/$/, '');
const VAPID_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

export const pushAvailable = () =>
  !!PUSH_URL &&
  !!VAPID_KEY &&
  !isNativeApp() &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

function keyBytes(b64u: string) {
  const b64 = b64u.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((b64u.length + 3) % 4);
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

async function subscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  if (existing) return existing;
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_KEY!) });
}

/**
 * Ask the server to watch this reminder. Call from the 🔔 tap (iPhone only allows the
 * notification permission question after a tap). Returns the server's reminder id.
 */
export async function armOnServer(a: BusAlert): Promise<string | null> {
  if (!pushAvailable()) return null;
  if (Notification.permission === 'default') await Notification.requestPermission();
  if (Notification.permission !== 'granted') return null;
  try {
    const sub = await subscription();
    if (!sub) return null;
    const res = await fetch(`${PUSH_URL}/alerts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        co: a.co,
        route: a.route,
        dir: a.dir,
        serviceType: a.serviceType,
        stopId: a.stopId,
        seq: a.seq,
        stopName: a.stopName,
        marks: a.marks,
      }),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id: string }).id;
  } catch {
    return null;
  }
}

function cancelOnServer(id: string) {
  if (!PUSH_URL) return;
  fetch(`${PUSH_URL}/alerts/${id}`, { method: 'DELETE', keepalive: true }).catch(() => {});
}

// When a reminder is cancelled (✕, bell, or finished), stop it on the server too.
useAlerts.subscribe((state, prev) => {
  const now = new Set(state.alerts.map((a) => a.id));
  for (const a of prev.alerts) if (a.serverId && !now.has(a.id)) cancelOnServer(a.serverId);
});
