/** Seconds until `eta` (negative once it has passed), corrected for a wrong phone clock. */
export function secondsUntil(eta: Date, dataTimestamp: Date, fetchedAt: number, now = Date.now()): number {
  // server "now" ≈ dataTimestamp + (time passed since we fetched)
  const skew = dataTimestamp.getTime() - fetchedAt; // server - device
  const serverNow = now + clampSkew(skew);
  return (eta.getTime() - serverNow) / 1000;
}

/** Minutes until `eta`, floored, never negative. */
export function minutesUntil(eta: Date, dataTimestamp: Date, fetchedAt: number, now = Date.now()): number {
  return Math.max(0, Math.floor(secondsUntil(eta, dataTimestamp, fetchedAt, now) / 60));
}

/** How long after its arrival time a bus still counts as "at the stop" before we assume it left. */
export const AT_STOP_SECONDS = 120;

export type BusPhase = 'arrived' | 'arriving' | 'minutes' | 'gone';
/**
 * arrived  — arrival time has passed (bus at the stop, people boarding)
 * arriving — under a minute away
 * gone     — passed more than 2 minutes ago; treat as departed
 */
export function busPhase(seconds: number): BusPhase {
  if (seconds <= -AT_STOP_SECONDS) return 'gone';
  if (seconds <= 0) return 'arrived';
  if (seconds < 60) return 'arriving';
  return 'minutes';
}

// data_timestamp can be up to ~1 min old; only trust large skews (wrong phone clock).
function clampSkew(skew: number) {
  return Math.abs(skew) < 90_000 ? 0 : skew;
}

const fmt = new Intl.DateTimeFormat('zh-HK', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Hong_Kong',
});

/** "18:42" in Hong Kong time regardless of device time zone */
export const hkClock = (d: Date) => fmt.format(d);

export const hkHour = (d = new Date()) =>
  +new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hour12: false, timeZone: 'Asia/Hong_Kong' }).format(d);
