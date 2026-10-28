import { AlertBell } from '../alerts/Alerts';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../data/sync';
import { useFavs, useUi } from '../store';
import { useT } from '../i18n';
import { useNow, usePolling } from '../hooks';
import { getArrivals, getKmbRouteEta } from '../api/eta';
import { ArrivalList, CompanyBadge, Empty, Footnote, Header, UpdatedLabel } from '../components/common';
import { routeHref, stopHref } from '../router';
import { distance } from '../utils/geo';
import { useLocation, LocationPrompt, MapsButton, DistanceTag, formatDistance, walkMinutes } from '../location';
import { busPhase, secondsUntil } from '../utils/time';
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
  const [showOthers, setShowOthers] = useState(false);
  const listRef = useRef<HTMLOListElement>(null);

  const other = r ? index.variants(co, route, dir === 'O' ? 'I' : 'O')[0] : undefined;
  const variants = r ? index.variants(co, route, dir).filter((v) => v.serviceType !== st) : [];
  // circular route (循環線): show it as 去程 (start → turning point) and 回程 (back)
  const loop = useMemo(() => (r && !other ? index.loopSplit(r) : null), [index, r, other]);
  const [userSeg, setUserSeg] = useState<'go' | 'back' | null>(null);

  // nearest stop to me on this route, from the live GPS position
  const pos = useLocation((x) => x.pos);
  const locStatus = useLocation((x) => x.status);
  const nearestInfo = useMemo(() => {
    if (!pos) return null;
    let best = -1;
    let bestD = Infinity;
    keys.forEach((k, i) => {
      const s = index.stops.get(k);
      if (!s) return;
      const d = distance(pos.lat, pos.lng, s.lat, s.lng);
      if (d < bestD) [best, bestD] = [i, d];
    });
    return best < 0 ? null : { idx: best, dist: Math.round(bestD) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pos?.lat, pos?.lng, r?.id]);
  const nearest = nearestInfo?.idx ?? -1;

  // which half of a loop to show: the one you picked, else the one holding the stop you
  // came for (search / trip / favourite), else the one nearest to you
  const seg: 'go' | 'back' | null = !loop
    ? null
    : (userSeg ??
      ((board >= 0 ? board : highlightKey ? keys.indexOf(highlightKey) : nearest) > loop.turnIdx ? 'back' : 'go'));
  const inSeg = (i: number) => !loop || (seg === 'go' ? i <= loop.turnIdx : i >= loop.turnIdx);
  const stopEl = (i: number) => listRef.current?.querySelector(`[data-idx="${i}"]`) as HTMLElement | null;

  // first time we learn where you are: open your nearest stop (unless a stop was picked)
  const autoOpened = useRef(false);
  useEffect(() => {
    if (nearest < 0 || autoOpened.current) return;
    autoOpened.current = true;
    setOpen((o) => (o < 0 ? nearest : o));
  }, [nearest]);

  // scroll the opened stop into view on first render
  useEffect(() => {
    if (open < 0) return;
    stopEl(open)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id, nearest >= 0]);

  // KMB: one call gives the next bus for every stop on the route
  const routeEta = usePolling((force) => getKmbRouteEta(route, st, force), [co, route, st], co === 'KMB' && !!r);
  const now = useNow(1000);
  const firstBySeq = useMemo(() => {
    const m = new Map<number, number>(); // seq -> seconds until the next bus that hasn't left
    const res = routeEta.data;
    if (!res) return m;
    for (const row of res.rows) {
      if (row.dir !== dir || !row.eta) continue;
      const sec = secondsUntil(row.eta, row.dataTimestamp, res.fetchedAt, now);
      if (busPhase(sec) === 'gone') continue;
      const cur = m.get(row.seq);
      if (cur === undefined || sec < cur) m.set(row.seq, sec);
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
          {loop ? (
            seg === 'go' ? (
              <>
                {r.origTc} <span className="arrow">→</span> <b>{loop.turnName}</b>
              </>
            ) : (
              <>
                {loop.turnName} <span className="arrow">→</span> <b>{r.origTc}</b>
              </>
            )
          ) : (
            <>
              {r.origTc} <span className="arrow">→</span> <b>{r.destTc}</b>
            </>
          )}
        </div>
        {loop && (
          <div className="loop-tabs seg" role="tablist" aria-label={t('route.loop')}>
            {(['go', 'back'] as const).map((g) => (
              <button
                key={g}
                role="tab"
                aria-selected={seg === g}
                className={seg === g ? 'active' : ''}
                onClick={() => setUserSeg(g)}
              >
                {g === 'go' ? t('route.loopGo', { to: loop.turnName }) : t('route.loopBack', { to: r.origTc })}
              </button>
            ))}
          </div>
        )}
        <div className="route-head-actions">
          <span className="muted">
            {t('route.stops', { n: loop ? keys.filter((_, i) => inSeg(i)).length : keys.length })}
            {loop && <span className="chip">{t('route.loop')}</span>}
          </span>
          {other && (
            <a className="pill-btn" href={routeHref(co, route, other.dir, other.serviceType)}>
              {t('route.swap')}
            </a>
          )}
          {loop && (
            <button className="pill-btn" onClick={() => setUserSeg(seg === 'go' ? 'back' : 'go')}>
              {t('route.swap')}
            </button>
          )}
        </div>
        <LineFavButton co={co} route={route} dir={dir} st={st} />
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

      {nearestInfo ? (
        <div className="card nearest-card">
          <div className="nearest-head">
            <span className="nearest-pin">📍</span>
            <div className="nearest-text">
              <div className="muted small">{t('loc.nearestTitle')}</div>
              <b>{index.stops.get(keys[nearestInfo.idx])?.nameTc}</b>
              <div className="small">
                {t('loc.straight', { d: formatDistance(nearestInfo.dist) })} · {t('loc.walk', { m: walkMinutes(nearestInfo.dist) })}
              </div>
            </div>
          </div>
          <div className="nearest-actions">
            {(() => {
              const s = index.stops.get(keys[nearestInfo.idx]);
              return s ? <MapsButton lat={s.lat} lng={s.lng} /> : null;
            })()}
            <button
              className="pill-btn"
              onClick={() => {
                setOpen(nearestInfo.idx);
                if (loop) setUserSeg(nearestInfo.idx > loop.turnIdx ? 'back' : 'go');
                setTimeout(() => stopEl(nearestInfo.idx)?.scrollIntoView({ block: 'center', behavior: 'smooth' }), 50);
              }}
            >
              {t('loc.showStop')}
            </button>
          </div>
        </div>
      ) : locStatus === 'asking' ? (
        <div className="loc-prompt">{t('loc.finding')}</div>
      ) : (
        <LocationPrompt />
      )}

      <ol className="timeline" ref={listRef}>
        {keys.map((k, i) => {
          if (!inSeg(i)) return null;
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
            <li key={`${k}-${i}`} data-idx={i} className={`stop ${cls}`}>
              <div className="stop-line" onClick={() => setOpen(open === i ? -1 : i)} role="button" tabIndex={0}>
                <span className="dot">{i + 1}</span>
                <span className="stop-title">
                  {s?.nameTc ?? k}
                  {i === nearest && <span className="chip chip-accent">{t('route.nearest')}</span>}
                  {i === board && <span className="chip chip-green">{t('route.board')}</span>}
                  {i === alight && <span className="chip chip-red">{t('route.alight')}</span>}
                </span>
                {m !== undefined && (
                  <span className={`mini-eta phase-${busPhase(m)}`}>
                    {busPhase(m) === 'arrived'
                      ? t('arrived')
                      : busPhase(m) === 'arriving'
                        ? t('arriving')
                        : `${Math.floor(m / 60)} ${t('min')}`}
                  </span>
                )}
                <StarButton co={co} route={route} dir={dir} st={st} stopId={s?.stopId ?? k.split('-')[1]} />
              </div>
              {i === open && <StopEta co={co} route={route} dir={dir} st={st} stopKey={k} seq={i + 1} stopName={s?.nameTc ?? k} lat={s?.lat} lng={s?.lng} />}
            </li>
          );
        })}
      </ol>
      <Footnote />
    </div>
  );
}

function StopEta({ co, route, dir, st, stopKey, seq, stopName, lat, lng }: { co: Company; route: string; dir: Dir; st: number; stopKey: string; seq: number; stopName: string; lat?: number; lng?: number }) {
  const t = useT();
  const stopId = stopKey.slice(stopKey.indexOf('-') + 1);
  const eta = usePolling((force) => getArrivals(co, route, dir, st, stopId, seq, force), [co, route, dir, st, stopKey, seq]);
  return (
    <div className="stop-eta">
      <ArrivalList result={eta.data} loading={eta.loading} error={eta.error} onRetry={eta.reload} />
      <div className="stop-eta-actions">
        <AlertBell co={co} route={route} dir={dir} serviceType={st} stopId={stopId} seq={seq} stopName={stopName} />
        <span className="muted small">{t('alert.set')}</span>
      </div>
      {lat !== undefined && lng !== undefined && (
        <div className="stop-eta-actions">
          <MapsButton lat={lat} lng={lng} />
          <DistanceTag lat={lat} lng={lng} />
        </div>
      )}
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

/** Favourite the whole line (this direction): the card then follows your nearest stop. */
function LineFavButton({ co, route, dir, st }: { co: Company; route: string; dir: Dir; st: number }) {
  const t = useT();
  const fav = useFavs((s) => s.isFav(co, route, dir, st, ''));
  const { addFav, removeFav } = useFavs();
  const showToast = useUi((s) => s.showToast);
  return (
    <div className="line-fav">
      <button
        className={`big-btn ${fav ? 'secondary' : ''}`}
        aria-pressed={!!fav}
        onClick={() => {
          if (fav) {
            removeFav(fav.id);
            showToast(t('fav.removed'));
          } else {
            addFav({ co, route, dir, serviceType: st, stopId: '' });
            showToast(t('fav.lineAdded'));
          }
        }}
      >
        {fav ? t('route.favLineOn') : t('route.favLine')}
      </button>
      {!fav && <p className="muted small">{t('route.favLineHint')}</p>}
    </div>
  );
}
