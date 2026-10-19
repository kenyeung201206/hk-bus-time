import { DistanceTag, MapsButton } from '../location';
import { BusIcon } from '../components/icons';
import { AlertBell } from '../alerts/Alerts';
import { useMemo, useRef, useState } from 'react';
import { useFavs, useSettings, useUi } from '../store';
import { useData } from '../data/sync';
import { useT } from '../i18n';
import { refreshAll, useLongPress, usePolling } from '../hooks';
import { getArrivals } from '../api/eta';
import { ArrivalList, CompanyBadge, Empty, Footnote, Header, UpdatedLabel } from '../components/common';
import { go, routeHref } from '../router';
import { themeById } from '../themes';
import { hkHour } from '../utils/time';
import { planTrip, sortTrips, type TripResult } from '../data/tripFinder';
import type { Favourite, SavedTrip } from '../types';

export function FavouritesScreen() {
  const t = useT();
  const favs = useFavs((s) => s.favourites);
  const trips = useFavs((s) => s.savedTrips);
  const lastUpdated = useUi((s) => s.lastUpdated);
  const theme = themeById(useSettings((s) => s.theme));
  const mascot = theme.mascot;
  const [editing, setEditing] = useState(false);

  // morning group first before noon, evening group first after
  const groups = useMemo(() => {
    const sorted = [...favs].sort((a, b) => a.sortOrder - b.sortOrder);
    if (!sorted.some((f) => f.group && f.group !== 'other')) return [{ key: '', list: sorted }];
    const order = hkHour() < 12 ? ['morning', 'evening', 'other'] : ['evening', 'morning', 'other'];
    return order
      .map((g) => ({ key: g, list: sorted.filter((f) => (f.group ?? 'other') === g) }))
      .filter((g) => g.list.length);
  }, [favs]);

  return (
    <PullToRefresh>
      <Header
        icon={<BusIcon co="KMB" size={36} />}
        title={
          <>
            <span className="grad">{t('fav.title')}</span>
          </>
        }
        right={
          <>
            {favs.length > 0 && <UpdatedLabel at={lastUpdated} onRefresh={refreshAll} />}
            {(favs.length > 0 || trips.length > 0) && (
              <button className="pill-btn" onClick={() => setEditing(!editing)}>
                {editing ? t('fav.done') : t('fav.edit')}
              </button>
            )}
          </>
        }
      />

      {trips.length > 0 && (
        <section>
          <h2 className="section-title">{t('trip.saved')}</h2>
          {trips.map((tr) => (
            <TripCard key={tr.id} trip={tr} editing={editing} />
          ))}
        </section>
      )}

      {favs.length === 0 ? (
        <Empty>
          <div className="empty-buses">
            <BusIcon co="KMB" size={64} />
            <span className="mascot bounce">{mascot}</span>
            <BusIcon co="CTB" size={64} />
          </div>
          <p>{t('fav.empty')}</p>
          <button className="big-btn" onClick={() => go('search')}>
            {t('fav.add')}
          </button>
        </Empty>
      ) : (
        groups.map((g) => (
          <section key={g.key}>
            {g.key && <h2 className="section-title">{t(`fav.group.${g.key}`)}</h2>}
            {g.list.map((f) => (
              <FavCard key={f.id} fav={f} editing={editing} />
            ))}
          </section>
        ))
      )}
      {favs.length > 0 && !editing && <p className="hint">{t('fav.longPressHint')}</p>}
      {favs.length > 0 && <Footnote />}
    </PullToRefresh>
  );
}

function FavCard({ fav, editing }: { fav: Favourite; editing: boolean }) {
  const t = useT();
  const index = useData((s) => s.index);
  const { removeFav, renameFav, moveFav, setGroup } = useFavs();
  const showToast = useUi((s) => s.showToast);
  const route = index?.getRoute(fav.co, fav.route, fav.dir, fav.serviceType);
  const stopKey = `${fav.co}-${fav.stopId}`;
  const stopIdx = route ? index!.routeStops.get(route.id)!.indexOf(stopKey) : -1;
  const stop = index?.stops.get(stopKey);
  const broken = index && (!route || stopIdx < 0);

  const eta = usePolling(
    (force) => getArrivals(fav.co, fav.route, fav.dir, fav.serviceType, fav.stopId, stopIdx + 1, force),
    [fav.id],
    !broken,
  );

  const rename = () => {
    const name = prompt(t('fav.renamePrompt'), fav.label ?? '');
    if (name !== null) renameFav(fav.id, name.trim());
  };
  const lp = useLongPress(rename);

  const open = () => {
    if (lp.wasLong() || editing) return;
    if (broken) go(`search?q=${encodeURIComponent(fav.route)}`);
    else go(routeHref(fav.co, fav.route, fav.dir, fav.serviceType, `?stop=${encodeURIComponent(stopKey)}`));
  };

  return (
    <article className="card fav-card" {...lp.handlers} onClick={open} role="button" tabIndex={0}>
      <div className="card-top fav-top">
        <BusIcon co={fav.co} size={52} label={t(`co.${fav.co}`)} />
        <div className="fav-head">
          <div className="fav-line">
            <span className="route-no">{fav.route}</span>
            <CompanyBadge co={fav.co} plain />
            {fav.label && <span className="label-chip">{fav.label}</span>}
          </div>
          <div className="dest">
            {t('to')} {route?.destTc ?? '…'}
          </div>
          <div className="stop-name">{stop?.nameTc ?? fav.stopId}</div>
          {stop && (
            <div className="where-row">
              <DistanceTag lat={stop.lat} lng={stop.lng} />
              <MapsButton lat={stop.lat} lng={stop.lng} compact />
            </div>
          )}
        </div>
        {!broken && (
          <AlertBell
            co={fav.co}
            route={fav.route}
            dir={fav.dir}
            serviceType={fav.serviceType}
            stopId={fav.stopId}
            seq={stopIdx + 1}
            stopName={stop?.nameTc ?? fav.stopId}
          />
        )}
      </div>
      {broken ? (
        <div className="eta-error">{t('fav.routeChanged')}</div>
      ) : (
        <ArrivalList result={eta.data} loading={eta.loading} error={eta.error} onRetry={eta.reload} />
      )}
      {editing && (
        <div className="edit-row" onClick={(e) => e.stopPropagation()}>
          <button className="icon-btn" onClick={() => moveFav(fav.id, -1)} aria-label="上移">
            ↑
          </button>
          <button className="icon-btn" onClick={() => moveFav(fav.id, 1)} aria-label="下移">
            ↓
          </button>
          <select
            value={fav.group ?? 'other'}
            onChange={(e) => setGroup(fav.id, e.target.value as Favourite['group'])}
            aria-label="分組"
          >
            <option value="morning">{t('fav.group.morning')}</option>
            <option value="evening">{t('fav.group.evening')}</option>
            <option value="other">{t('fav.group.other')}</option>
          </select>
          <button className="pill-btn" onClick={rename}>
            ✏️ {t('fav.rename')}
          </button>
          <button
            className="pill-btn danger"
            onClick={() => {
              removeFav(fav.id);
              showToast(t('fav.removed'));
            }}
          >
            🗑 {t('fav.delete')}
          </button>
        </div>
      )}
    </article>
  );
}

function TripCard({ trip, editing }: { trip: SavedTrip; editing: boolean }) {
  const t = useT();
  const index = useData((s) => s.index);
  const removeTrip = useFavs((s) => s.removeTrip);
  const top = useMemo<TripResult[]>(() => {
    if (!index) return [];
    return sortTrips(planTrip(index, trip.from, trip.to).results, 'stops', () => undefined).slice(0, 2);
  }, [index, trip.from, trip.to]);

  return (
    <article
      className="card trip-card"
      onClick={() => !editing && go(`trip?from=${encodeURIComponent(trip.from)}&to=${encodeURIComponent(trip.to)}`)}
    >
      <div className="card-top">
        <span className="trip-label">🧭 {trip.label}</span>
        <span className="dest">
          {trip.from} → {trip.to}
        </span>
      </div>
      {top.length === 0 && <div className="eta-none">{t('tripf.none')}</div>}
      {top.map((r) => (
        <TripMini key={r.route.id} r={r} />
      ))}
      {editing && (
        <div className="edit-row" onClick={(e) => e.stopPropagation()}>
          <button className="pill-btn danger" onClick={() => removeTrip(trip.id)}>
            🗑 {t('fav.delete')}
          </button>
        </div>
      )}
    </article>
  );
}

function TripMini({ r }: { r: TripResult }) {
  const t = useT();
  const eta = usePolling(
    (force) => getArrivals(r.route.co, r.route.route, r.route.dir, r.route.serviceType, r.board.stopId, r.boardIdx + 1, force),
    [r.route.id, r.board.key],
  );
  return (
    <div className="trip-mini">
      <div className="card-top">
        <CompanyBadge co={r.route.co} />
        <span className="route-no small">{r.route.route}</span>
        <span className="dest">{t('tripf.boardAt', { s: r.board.nameTc })}</span>
      </div>
      <ArrivalList result={eta.data} loading={eta.loading} error={eta.error} onRetry={eta.reload} compact />
    </div>
  );
}

/** Pull down at the top of the page to refresh all live times. */
export function PullToRefresh({ children }: { children: React.ReactNode }) {
  const t = useT();
  const start = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  return (
    <div
      onTouchStart={(e) => {
        start.current = window.scrollY <= 0 ? e.touches[0].clientY : null;
      }}
      onTouchMove={(e) => {
        if (start.current !== null) setPull(Math.max(0, Math.min(100, e.touches[0].clientY - start.current)));
      }}
      onTouchEnd={() => {
        if (pull > 70) refreshAll();
        start.current = null;
        setPull(0);
      }}
    >
      {pull > 10 && (
        <div className="ptr" style={{ height: pull }}>
          {pull > 70 ? t('pullToRefresh') : '↓'}
        </div>
      )}
      {children}
    </div>
  );
}
