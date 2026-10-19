import { useMemo } from 'react';
import { BusStopIcon } from '../components/icons';
import { useData } from '../data/sync';
import { useSettings } from '../store';
import { useT } from '../i18n';
import { CompanyBadge, Empty, Header } from '../components/common';
import { stopHref } from '../router';
import { themeById } from '../themes';
import { LocationPrompt, MapsButton, formatDistance, useLocation, walkMinutes } from '../location';

export function NearbyScreen() {
  const t = useT();
  const index = useData((s) => s.index)!;
  const mascot = themeById(useSettings((s) => s.theme)).mascot;
  const pos = useLocation((s) => s.pos);
  const status = useLocation((s) => s.status);
  const retry = useLocation((s) => s.retry);

  // round to ~10 m so the list doesn't reshuffle on every tiny GPS wobble
  const lat = pos ? Math.round(pos.lat * 1e4) / 1e4 : null;
  const lng = pos ? Math.round(pos.lng * 1e4) / 1e4 : null;
  // location never leaves the phone: stops are filtered locally
  const stops = useMemo(
    () => (lat !== null && lng !== null ? index.stopsNear(lat, lng, 300).slice(0, 40) : []),
    [index, lat, lng],
  );

  return (
    <div>
      <Header
        title={t('nearby.title')}
        icon={<BusStopIcon />}
        right={
          pos && (
            <button className="icon-btn" onClick={retry} aria-label={t('refresh')}>
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
          {status === 'asking' ? <p>{t('nearby.locating')}</p> : <LocationPrompt />}
        </Empty>
      )}
      {pos && stops.length === 0 && <Empty>{t('nearby.none')}</Empty>}
      <ul className="list">
        {stops.map((s) => {
          const names = [...new Set(index.routesAtStop(s.key).map((x) => x.route.route))];
          return (
            <li key={s.key} className="nearby-item">
              <a className="row" href={stopHref(s.key)}>
                <CompanyBadge co={s.co} />
                <span className="row-text">
                  {s.nameTc}
                  <small className="muted">
                    {' '}
                    {names.slice(0, 8).join(' · ')}
                    {names.length > 8 ? ' …' : ''}
                  </small>
                </span>
                <span className="dist">
                  {formatDistance(s.dist)}
                  <small>{t('loc.walk', { m: walkMinutes(s.dist) })}</small>
                </span>
              </a>
              <div className="nearby-map">
                <MapsButton lat={s.lat} lng={s.lng} compact />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
