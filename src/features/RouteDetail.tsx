import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data/sync';
import { useFavs, useUi } from '../store';
import { useT } from '../i18n';
import { useNow, usePolling } from '../hooks';
import { getArrivals, getKmbRouteEta } from '../api/eta';
import { ArrivalList, CompanyBadge, Empty, Footnote, Header, UpdatedLabel } from '../components/common';
import { routeHref, stopHref } from '../router';
import { getPosition, distance } from '../utils/geo';
import { minutesUntil } from '../utils/time';
import type { Company, Dir } from '../types';

export function RouteDetailScreen({ co, route, dir, st, query }: { co: Company; route: string; dir: Dir; st: number; query: URLSearchParams }) {
  const t = useT();
  const index = useData((s) => s.index)!;
  const r = index.getRoute(co, route, dir, st);
  const keys = r ? index.routeStops.get(r.id)! : [];
  const highlightKey = query.get('stop');
  const board = query.has('board') ? +query.get('board')! : -1;
  const alight = query.has('alight') ? +query.get('alight')! : -1;
  const [open, setOpen] = useState<number>(() => (board >= 0 ? board : highlightKey ? keys.indexOf(highlightKey) : -1));
  const [nearest, setNearest] = useState(-1);
  const [showOthers, setShowOthers] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const other = r ? index.variants(co, route, dir === 'O' ? 'I' : 'O')[0] : undefined;
  const variants = r ? index.variants(co, route, dir).filter((v) => v.serviceType !== st) : [];

  // highlight nearest stop only if location permission is already granted (no surprise prompt)
  useEffect(() => {
    let alive = true;
    navigator.permissions
      ?.query({ name: 'geolocation' as PermissionName })
      .then((p) => (p.state === 'granted' ? getPosition() : Promise.reject()))
      .then((pos) => {
        if (!alive) return;
        let best = -1;
        let bestD = Infinity;
        keys.forEach((k, i) => {
          const s = index.stops.get(k);
          if (!s) return;
          const d = distance(pos.lat, pos.lng, s.lat, s.lng);
          if (d < bestD) [best, bestD] = [i, d];
        });
        if (bestD < 1000) {
          setNearest(best);
          setOpen((o) => (o < 0 ? best : o));
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id]);

  // scroll the opened stop into view on first render
  useEffect(() => {
    if (open < 0) return;
    const el = listRef.current?.children[open] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, nearest]);

  // KMB: one call gives the next bus for every stop on the route
  const routeEta = usePolling((force) => getKmbRouteEta(route, st, force), [co, route, st], co === 'KMB' && !!r);
  const now = useNow(10000);
  const firstBySeq = useMemo(() => {
    const m = new Map<number, number>();
    const res = routeEta.data;
    if (!res) return m;
    for (const row of res.rows) {
      if (row.dir !== dir || row.etaSeq !== 1 || !row.eta) continue;
      m.set(row.seq, minutesUntil(row.eta, row.dataTimestamp, res.fetchedAt, now));
    }
    return m;
  }, [routeEta.data, dir, now]);

  if (!r) return <Empty>{t('search.noResult')}</Empty>;

  const share = async () => {
    const url = location.href;
    try {
      if (navigator.share) await navigator.share({ title: `${r.route} ${r.destTc}`, url });
      else {
        await navigator.clipboard.writeText(url);
        useUi.getState().showToast('已複製連結');
      }
    } catch {
      /* cancelled */
    }
  };

  return (
    <div>
      <Header
        back
        title={
          <span className="title-route">
            <CompanyBadge co={co} /> {route}
          </span>
        }
        right={
          <>
            {co === 'KMB' && <UpdatedLabel at={routeEta.updatedAt} onRefresh={routeEta.reload} loading={routeEta.loading} />}
            <button className="icon-btn" onClick={share} aria-label="分享">
              ↗
            </button>
          </>
        }
      />
      <div className="route-head card">
        <div className="od">
          {r.origTc} <span className="arrow">→</span> <b>{r.destTc}</b>
        </div>
        <div className="route-head-actions">
          <span className="muted">{t('route.stops', { n: keys.length })}</span>
          {other && (
            <a className="pill-btn" href={routeHref(co, route, other.dir, other.serviceType)}>
              {t('route.swap')}
            </a>
          )}
        </div>
        {variants.length > 0 && (
          <div className="variants">
            <button className="link-btn" onClick={() => setShowOthers(!showOthers)}>
              {t('route.otherServices')} ({variants.length}) {showOthers ? '▲' : '▼'}
            </button>
            {showOthers &&
              variants.map((v) => (
                <a key={v.id} className="row small" href={routeHref(co, route, v.dir, v.serviceType)}>
                  {v.origTc} → {v.destTc}
                </a>
              ))}
          </div>
        )}
      </div>

      <ol className="timeline" ref={listRef}>
        {keys.map((k, i) => {
          const s = index.stops.get(k);
          const cls = [
            i === open ? 'open' : '',
            i === nearest ? 'nearest' : '',
            i === board ? 'board' : '',
            i === alight ? 'alight' : '',
            board >= 0 && alight > board && i > board && i < alight ? 'between' : '',
            k === highlightKey ? 'hl' : '',
          ].join(' ');
          const m = firstBySeq.get(i + 1);
          return (
            <li key={`${k}-${i}`} className={`stop ${cls}`}>
              <div className="stop-line" onClick={() => setOpen(open === i ? -1 : i)} role="button" tabIndex={0}>
                <span className="dot">{i + 1}</span>
                <span className="stop-title">
                  {s?.nameTc ?? k}
                  {i === nearest && <span className="chip chip-accent">{t('route.nearest')}</span>}
                  {i === board && <span className="chip chip-green">{t('route.board')}</span>}
                  {i === alight && <span className="chip chip-red">{t('route.alight')}</span>}
                </span>
                {m !== undefined && <span className="mini-eta">{m === 0 ? t('arriving') : `${m} ${t('min')}`}</span>}
                <StarButton co={co} route={route} dir={dir} st={st} stopId={s?.stopId ?? k.split('-')[1]} />
              </div>
              {i === open && <StopEta co={co} route={route} dir={dir} st={st} stopKey={k} seq={i + 1} />}
            </li>
          );
        })}
      </ol>
      <Footnote />
    </div>
  );
}

function StopEta({ co, route, dir, st, stopKey, seq }: { co: Company; route: string; dir: Dir; st: number; stopKey: string; seq: number }) {
  const t = useT();
  const stopId = stopKey.slice(stopKey.indexOf('-') + 1);
  const eta = usePolling((force) => getArrivals(co, route, dir, st, stopId, seq, force), [co, route, dir, st, stopKey, seq]);
  return (
    <div className="stop-eta">
      <ArrivalList result={eta.data} loading={eta.loading} error={eta.error} onRetry={eta.reload} />
      <a className="link-btn" href={stopHref(stopKey)}>
        {t('stop.routes')} ›
      </a>
    </div>
  );
}

export function StarButton({ co, route, dir, st, stopId }: { co: Company; route: string; dir: Dir; st: number; stopId: string }) {
  const t = useT();
  const fav = useFavs((s) => s.isFav(co, route, dir, st, stopId));
  const { addFav, removeFav } = useFavs();
  const showToast = useUi((s) => s.showToast);
  return (
    <button
      className={`star ${fav ? 'on' : ''}`}
      aria-pressed={!!fav}
      aria-label={t('route.addFav')}
      onClick={(e) => {
        e.stopPropagation();
        if (fav) {
          removeFav(fav.id);
          showToast(t('fav.removed'));
        } else {
          addFav({ co, route, dir, serviceType: st, stopId });
          showToast(t('fav.added'));
        }
      }}
    >
      {fav ? '★' : '☆'}
    </button>
  );
}
