import { BusStopIcon } from '../components/icons';
import { useMemo } from 'react';
import { useData } from '../data/sync';
import { useT } from '../i18n';
import { usePolling } from '../hooks';
import { getArrivals, getKmbStopEta, type EtaResult } from '../api/eta';
import { ArrivalList, CompanyBadge, Empty, Footnote, Header, UpdatedLabel } from '../components/common';
import { routeHref, stopHref } from '../router';
import { StarButton } from './RouteDetail';
import type { Route } from '../types';

export function StopDetailScreen({ stopKey }: { stopKey: string }) {
  const t = useT();
  const index = useData((s) => s.index)!;
  const stop = index.stops.get(stopKey);
  const routes = useMemo(() => index.routesAtStop(stopKey), [index, stopKey]);
  // other company's poles within 50 m (same physical stop)
  const nearbyOther = useMemo(
    () => (stop ? index.stopsNear(stop.lat, stop.lng, 50).filter((s) => s.co !== stop.co) : []),
    [index, stop],
  );

  // KMB: one call for every route at this stop
  const kmb = usePolling((force) => getKmbStopEta(stop!.stopId, force), [stopKey], stop?.co === 'KMB');

  if (!stop) return <Empty>{t('search.noResult')}</Empty>;

  return (
    <div>
      <Header
        back
        title={stop.nameTc}
        icon={<BusStopIcon />}
        right={stop.co === 'KMB' && <UpdatedLabel at={kmb.updatedAt} onRefresh={kmb.reload} loading={kmb.loading} />}
      />
      <h2 className="section-title">{t('stop.routes')}</h2>
      {routes.map(({ route, idx }) => (
        <RouteAtStop
          key={`${route.id}-${idx}`}
          route={route}
          idx={idx}
          stopKey={stopKey}
          kmb={stop.co === 'KMB' ? { data: kmb.data, error: kmb.error, loading: kmb.loading, reload: kmb.reload } : undefined}
        />
      ))}
      {nearbyOther.length > 0 && (
        <section>
          <h2 className="section-title">{t('stop.nearbyOther')}</h2>
          <ul className="list">
            {nearbyOther.map((s) => (
              <li key={s.key}>
                <a className="row" href={stopHref(s.key)}>
                  <CompanyBadge co={s.co} />
                  <span className="row-text">{s.nameTc}</span>
                  <small className="muted">{Math.round(s.dist)} 米</small>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Footnote />
    </div>
  );
}

function RouteAtStop({
  route,
  idx,
  stopKey,
  kmb,
}: {
  route: Route;
  idx: number;
  stopKey: string;
  kmb?: { data?: EtaResult; error: boolean; loading: boolean; reload: () => void };
}) {
  const t = useT();
  const stopId = stopKey.slice(stopKey.indexOf('-') + 1);
  const ctb = usePolling(
    (force) => getArrivals(route.co, route.route, route.dir, route.serviceType, stopId, idx + 1, force),
    [route.id, stopKey],
    !kmb,
  );
  const result = useMemo<EtaResult | undefined>(() => {
    if (!kmb) return ctb.data;
    if (!kmb.data) return undefined;
    let rows = kmb.data.rows.filter((r) => r.route === route.route && r.dir === route.dir && r.serviceType === route.serviceType);
    if (new Set(rows.map((r) => r.seq)).size > 1) rows = rows.filter((r) => r.seq === idx + 1);
    return { rows: rows.sort((a, b) => a.etaSeq - b.etaSeq).slice(0, 3), fetchedAt: kmb.data.fetchedAt };
  }, [kmb, kmb?.data, ctb.data, route, idx]);
  const src = kmb ?? ctb;

  return (
    <article className="card">
      <a className="card-top" href={routeHref(route.co, route.route, route.dir, route.serviceType, `?stop=${encodeURIComponent(stopKey)}`)}>
        <CompanyBadge co={route.co} />
        <span className="route-no">{route.route}</span>
        <span className="dest">
          {t('to')} {route.destTc}
        </span>
        <StarButton co={route.co} route={route.route} dir={route.dir} st={route.serviceType} stopId={stopId} />
      </a>
      <ArrivalList result={result} loading={src.loading} error={src.error} onRetry={src.reload} />
    </article>
  );
}
