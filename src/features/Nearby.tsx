import { BusStopIcon } from '../components/icons';
import { useMemo, useState } from 'react';
import { useData } from '../data/sync';
import { useSettings } from '../store';
import { useT } from '../i18n';
import { CompanyBadge, Empty, Header } from '../components/common';
import { stopHref } from '../router';
import { getPosition } from '../utils/geo';
import { themeById } from '../themes';

export function NearbyScreen() {
  const t = useT();
  const index = useData((s) => s.index)!;
  const mascot = themeById(useSettings((s) => s.theme)).mascot;
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [state, setState] = useState<'idle' | 'locating' | 'denied'>('idle');

  const locate = async () => {
    setState('locating');
    try {
      setPos(await getPosition());
      setState('idle');
    } catch {
      setState('denied');
    }
  };

  // location never leaves the phone: stops are filtered locally
  const stops = useMemo(() => (pos ? index.stopsNear(pos.lat, pos.lng, 300).slice(0, 40) : []), [index, pos]);

  return (
    <div>
      <Header
        title={t('nearby.title')}
        icon={<BusStopIcon />}
        right={
          pos && (
            <button className="icon-btn" onClick={locate} aria-label={t('refresh')}>
              ↻
            </button>
          )
        }
      />
      {!pos && (
        <Empty>
          <div className="mascot bounce">
            <BusStopIcon size={72} />
            {mascot}
          </div>
          <button className="big-btn" onClick={locate} disabled={state === 'locating'}>
            {state === 'locating' ? t('nearby.locating') : t('nearby.locate')}
          </button>
          {state === 'denied' && <p className="error-text">{t('nearby.denied')}</p>}
        </Empty>
      )}
      {pos && stops.length === 0 && <Empty>{t('nearby.none')}</Empty>}
      <ul className="list">
        {stops.map((s) => {
          const names = [...new Set(index.routesAtStop(s.key).map((x) => x.route.route))];
          return (
            <li key={s.key}>
              <a className="row" href={stopHref(s.key)}>
                <CompanyBadge co={s.co} />
                <span className="row-text">
                  {s.nameTc}
                  <small className="muted"> {names.slice(0, 8).join(' · ')}{names.length > 8 ? ' …' : ''}</small>
                </span>
                <span className="dist">{t('nearby.meters', { m: Math.round(s.dist) })}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
