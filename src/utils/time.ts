/** Minutes until `eta`, corrected for device clock skew using the server's data_timestamp. */
export function minutesUntil(eta: Date, dataTimestamp: Date, fetchedAt: number, now = Date.now()): number {
  // server "now" ≈ dataTimestamp + (time passed since we fetched)
  const skew = dataTimestamp.getTime() - fetchedAt; // server - device
  const serverNow = now + clampSkew(skew);
  return Math.max(0, Math.floor((eta.getTime() - serverNow) / 60000));
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
