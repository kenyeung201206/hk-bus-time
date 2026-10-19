// Cute hand-drawn style SVG icons: buses for each company plus little traffic friends
// used on every page. Decorative unless a `label` is given.
import type { Company } from '../types';
import { useSettings } from '../store';
import { themeById } from '../themes';

/** True when a 型格 (stylish) theme is on: icons switch to their flat, grown-up versions. */
export const useCoolStyle = () => themeById(useSettings((s) => s.theme)).style === 'cool';

const LIVERY: Record<Company, { body: string; band: string; roof: string; trim: string }> = {
  // KMB: cream body with red band (red/white livery)
  KMB: { body: '#fff6ec', band: '#e8414f', roof: '#ff8f9a', trim: '#b8212f' },
  // Citybus: sunny yellow body with orange band
  CTB: { body: '#ffd84d', band: '#ff8a2a', roof: '#ffe999', trim: '#c96a00' },
};

/** Smiling double-decker bus in the operator's colours (flat, face-less in 型格 themes). */
export function BusIcon({ co, size = 40, label, flat }: { co: Company; size?: number; label?: string; flat?: boolean }) {
  const cool = useCoolStyle();
  if (flat ?? cool) return <FlatBusIcon co={co} size={size} label={label} />;
  const c = LIVERY[co];
  return (
    <svg
      className="bus-icon"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <ellipse cx="32" cy="60" rx="22" ry="2.5" fill="rgba(0,0,0,.12)" />
      <rect x="8" y="6" width="48" height="48" rx="12" fill={c.body} stroke={c.trim} strokeWidth="2.5" />
      <path d="M12 8h40a10 10 0 0 1 3 4H9a10 10 0 0 1 3-4z" fill={c.roof} />
      {/* upper deck windows */}
      <rect x="13" y="13" width="17" height="11" rx="4" fill="#bfe8ff" stroke={c.trim} strokeWidth="1.5" />
      <rect x="34" y="13" width="17" height="11" rx="4" fill="#bfe8ff" stroke={c.trim} strokeWidth="1.5" />
      <rect x="8" y="27" width="48" height="6" fill={c.band} />
      {/* windscreen with face */}
      <rect x="14" y="35" width="36" height="12" rx="5" fill="#d6f1ff" stroke={c.trim} strokeWidth="1.5" />
      <circle cx="24.5" cy="40.5" r="1.8" fill="#3b2a3e" />
      <circle cx="39.5" cy="40.5" r="1.8" fill="#3b2a3e" />
      <path d="M29 43q3 2.6 6 0" stroke="#3b2a3e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      <circle cx="20.5" cy="43" r="2" fill="#ff9db5" opacity=".75" />
      <circle cx="43.5" cy="43" r="2" fill="#ff9db5" opacity=".75" />
      {/* headlights + wheels */}
      <circle cx="13" cy="50" r="2" fill="#fff3a8" stroke={c.trim} strokeWidth="1" />
      <circle cx="51" cy="50" r="2" fill="#fff3a8" stroke={c.trim} strokeWidth="1" />
      <rect x="15" y="52" width="9" height="6" rx="3" fill="#3b2a3e" />
      <rect x="40" y="52" width="9" height="6" rx="3" fill="#3b2a3e" />
    </svg>
  );
}

/** Traffic light with a smiling green light. */
export function TrafficLightIcon({ size = 34 }: { size?: number }) {
  return (
    <svg className="deco-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="29" y="50" width="6" height="12" rx="2" fill="#8d8aa8" />
      <rect x="18" y="4" width="28" height="48" rx="12" fill="#4b4766" />
      <circle cx="32" cy="16" r="6.5" fill="#ff8a8a" opacity=".55" />
      <circle cx="32" cy="29" r="6.5" fill="#ffd36e" opacity=".55" />
      <circle cx="32" cy="42" r="7" fill="#5fe08a" />
      <circle cx="29.5" cy="41" r="1.1" fill="#24543a" />
      <circle cx="34.5" cy="41" r="1.1" fill="#24543a" />
      <path d="M29.6 44q2.4 2 4.8 0" stroke="#24543a" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Round bus-stop sign. */
export function BusStopIcon({ size = 34 }: { size?: number }) {
  return (
    <svg className="deco-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <rect x="29.5" y="30" width="5" height="30" rx="2" fill="#8d8aa8" />
      <ellipse cx="32" cy="61" rx="10" ry="2" fill="rgba(0,0,0,.12)" />
      <circle cx="32" cy="22" r="18" fill="#fff" stroke="#e8414f" strokeWidth="5" />
      <rect x="22" y="13" width="20" height="16" rx="4" fill="#4dabf7" />
      <rect x="25" y="16" width="6" height="5" rx="1.5" fill="#fff" />
      <rect x="33" y="16" width="6" height="5" rx="1.5" fill="#fff" />
      <circle cx="26" cy="30" r="2.4" fill="#3b2a3e" />
      <circle cx="38" cy="30" r="2.4" fill="#3b2a3e" />
    </svg>
  );
}

/** Map pin with a dotted road — for trip finder. */
export function RouteIcon({ size = 34 }: { size?: number }) {
  return (
    <svg className="deco-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <path d="M10 54q14-4 18-16t26-14" stroke="#c7b8ff" strokeWidth="4" fill="none" strokeLinecap="round" strokeDasharray="1 7" />
      <circle cx="10" cy="54" r="5" fill="#5fe08a" stroke="#fff" strokeWidth="2" />
      <path d="M48 4a11 11 0 0 1 11 11c0 9-11 19-11 19S37 24 37 15A11 11 0 0 1 48 4z" fill="#ff6b8b" />
      <circle cx="48" cy="15" r="4.2" fill="#fff" />
    </svg>
  );
}

/** Magnifying glass looking at a tiny bus. */
export function SearchBusIcon({ size = 34 }: { size?: number }) {
  return (
    <svg className="deco-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <circle cx="27" cy="27" r="19" fill="#e3f4ff" stroke="#7c6cf0" strokeWidth="5" />
      <rect x="44" y="42" width="8" height="20" rx="4" transform="rotate(-45 48 52)" fill="#7c6cf0" />
      <rect x="17" y="18" width="20" height="17" rx="5" fill="#ffd84d" stroke="#c96a00" strokeWidth="1.5" />
      <rect x="20" y="21" width="14" height="6" rx="2" fill="#bfe8ff" />
      <circle cx="22" cy="36" r="2.2" fill="#3b2a3e" />
      <circle cx="32" cy="36" r="2.2" fill="#3b2a3e" />
    </svg>
  );
}

/** Bus wearing a little gear — settings. */
export function GearIcon({ size = 34 }: { size?: number }) {
  return (
    <svg className="deco-icon" width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <g transform="translate(32 32)">
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x="-5" y="-27" width="10" height="12" rx="3" fill="#b197fc" transform={`rotate(${i * 45})`} />
        ))}
        <circle r="19" fill="#b197fc" />
        <circle r="12" fill="#fff" />
        <circle cx="-4" cy="-1" r="1.8" fill="#3b2a3e" />
        <circle cx="4" cy="-1" r="1.8" fill="#3b2a3e" />
        <path d="M-3 4q3 2.4 6 0" stroke="#3b2a3e" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    </svg>
  );
}

/** Bell for the arrival reminder. */
export function BellIcon({ size = 22, on }: { size?: number; on?: boolean }) {
  return (
    <svg className={`bell-icon ${on ? 'ring' : ''}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 3a6 6 0 0 0-6 6v3.5L4.3 15.6A1 1 0 0 0 5.2 17h13.6a1 1 0 0 0 .9-1.4L18 12.5V9a6 6 0 0 0-6-6z"
        fill={on ? '#ffc928' : 'none'}
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path d="M9.5 19a2.5 2.5 0 0 0 5 0" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" />
    </svg>
  );
}

/** Sleek front view of a double-decker: dark glass, LED destination sign, no face. */
function FlatBusIcon({ co, size, label }: { co: Company; size: number; label?: string }) {
  const body = co === 'KMB' ? '#d81e2a' : '#ffcc00';
  const stripe = co === 'KMB' ? '#f3f3f3' : '#1b1b1b';
  return (
    <svg
      className="bus-icon flat"
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <rect x="10" y="4" width="44" height="52" rx="7" fill={body} />
      <rect x="14" y="8" width="36" height="6" rx="1.5" fill="#161616" />
      <rect x="17" y="9.8" width="18" height="2.4" rx="1" fill="#ffb627" />
      <rect x="14" y="17" width="36" height="12" rx="2" fill="#1f2a36" />
      <rect x="10" y="31" width="44" height="3" fill={stripe} />
      <rect x="14" y="36" width="36" height="12" rx="2" fill="#1f2a36" />
      <path d="M17 46l9-8" stroke="#ffffff" strokeOpacity=".22" strokeWidth="2" strokeLinecap="round" />
      <rect x="13" y="50" width="7" height="3" rx="1" fill="#f8f8f8" />
      <rect x="44" y="50" width="7" height="3" rx="1" fill="#f8f8f8" />
      <rect x="15" y="56" width="8" height="5" rx="1.5" fill="#161616" />
      <rect x="41" y="56" width="8" height="5" rx="1.5" fill="#161616" />
    </svg>
  );
}

/** Thin line icons for the tab bar in 型格 themes. */
export function LineIcon({ name, size = 24 }: { name: 'fav' | 'search' | 'trip' | 'nearby' | 'settings'; size?: number }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  return (
    <svg className="line-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {name === 'fav' && <path {...common} d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" />}
      {name === 'search' && (
        <>
          <circle {...common} cx="10.5" cy="10.5" r="6.5" />
          <path {...common} d="M15.5 15.5L21 21" />
        </>
      )}
      {name === 'trip' && (
        <>
          <circle {...common} cx="6" cy="18" r="2.2" />
          <path {...common} d="M8 17.5c6-1 2-7 8-8" />
          <path {...common} d="M18 3.5a3.5 3.5 0 0 1 3.5 3.5c0 2.6-3.5 5.5-3.5 5.5S14.5 9.6 14.5 7A3.5 3.5 0 0 1 18 3.5z" />
        </>
      )}
      {name === 'nearby' && (
        <>
          <path {...common} d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z" />
          <circle {...common} cx="12" cy="10" r="2.3" />
        </>
      )}
      {name === 'settings' && (
        <>
          <circle {...common} cx="12" cy="12" r="3" />
          <path
            {...common}
            d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"
          />
        </>
      )}
    </svg>
  );
}
