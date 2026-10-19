import { RouteIcon, TrafficLightIcon } from '../components/icons';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../data/sync';
import { useFavs, useSettings, useUi } from '../store';
import { useT } from '../i18n';
import { usePolling, useNow } from '../hooks';
import { getArrivals, type EtaResult } from '../api/eta';
import { ArrivalList, CompanyBadge, Empty, Footnote, Header } from '../components/common';
import { routeHref, useLoc } from '../router';
import { useLocation, MapsButton, DistanceTag } from '../location';
import { minutesUntil } from '../utils/time';
import { MY_LOCATION, planTrip, rideMinutes, sortTrips, type TripResult, type TripSort } from '../data/tripFinder';

const TOP_N = 10;

export function TripFinderScreen() {
  const t = useT();
  const loc = useLoc();
  const index = useData((s) => s.index)!;
  const { recentTrips, pushRecentTrip, addTrip } = useFavs();
  const showToast = useUi((s) => s.showToast);
  const [from, setFrom] = useState(loc.query.get('from') ?? '');
  const [to, setTo] = useState(loc.query.get('to') ?? '');
  const livePos = useLocation((s) => s.pos);
  const retryLoc = useLocation((s) => s.retry);
  const pos = livePos ?? undefined;
  const [query, setQuery] = useState<{ from: string; to: string } | null>(null);
  const [sort, setSort] = useState<TripSort>('fast');
  const [locating, setLocating] = useState(false);
  const [soonest, setSoonest] = useState<Record<string, number>>({});

  // arriving from a saved-trip card: run straight away
  useEffect(() => {
    const f = loc.query.get('from');
    const tt = loc.query.get('to');
    if (f && tt) {
      setFrom(f);
      setTo(tt);
      setQuery({ from: f, to: tt });
    }
  }, [loc]);

  const plan = useMemo(() => {
    if (!query) return null;
    const started = performance.now();
    const p = planTrip(index, query.from, query.to, pos);
    if (import.meta.env.DEV) console.debug(`trip search ${Math.round(performance.now() - started)} ms`);
    return p;
  }, [index, query, pos]);

  const sorted = useMemo(
    () => (plan ? sortTrips(plan.results, sort, (r) => soonest[r.route.id]) : []),
    [plan, sort, soonest],
  );

  const run = () => {
    if (!from.trim() || !to.trim()) return;
    setSoonest({});
    setQuery({ from: from.trim(), to: to.trim() });
    if (from !== MY_LOCATION) pushRecentTrip(from.trim(), to.trim());
  };

  const useMyLocation = () => {
    if (livePos) {
      setFrom(MY_LOCATION);
      return;
    }
    // ask again; fills in once the phone reports a position
    setLocating(true);
    if (!useSettings.getState().useLocation) useSettings.getState().set({ useLocation: true });
    else retryLoc();
  };
  useEffect(() => {
    if (locating && livePos) {
      setLocating(false);
      setFrom(MY_LOCATION);
    }
  }, [locating, livePos]);
  useEffect(() => {
    const st = useLocation.getState().status;
    if (locating && (st === 'denied' || st === 'unsupported')) {
      setLocating(false);
      showToast(t('nearby.denied'));
    }
  });
  // start from where you are when nothing is typed yet
  useEffect(() => {
    if (livePos && !from && !loc.query.get('from')) setFrom(MY_LOCATION);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!livePos]);

  const save = () => {
    if (!query) return;
    const label = prompt(t('tripf.saveName'), `${query.from} → ${query.to}`);
    if (label === null) return;
    addTrip({ label: label.trim() || `${query.from} → ${query.to}`, from: query.from, to: query.to });
    showToast(t('tripf.savedToast'));
  };

  let message = '';
  if (plan) {
    if (query!.from === query!.to) message = t('tripf.same');
    else if (!plan.O.length) message = t('tripf.noFrom');
    else if (!plan.D.length) message = t('tripf.noTo');
    else if (!plan.results.length) message = t('tripf.none');
  }

  return (
    <div>
      <Header title={t('tab.trip')} icon={<RouteIcon />} />
      <form
        className="card trip-form"
        onSubmit={(e) => {
          e.preventDefault();
          run();
        }}
      >
        <PlaceInput
          label={t('tripf.from')}
          value={from === MY_LOCATION ? t('tripf.myLocation') : from}
          onChange={setFrom}
          extra={
            <button type="button" className="icon-btn" onClick={useMyLocation} aria-label={t('tripf.myLocation')}>
              {locating ? '…' : '📍'}
            </button>
          }
        />
        <button
          type="button"
          className="swap-btn"
          aria-label="對調"
          onClick={() => {
            if (from === MY_LOCATION) return;
            setFrom(to);
            setTo(from);
          }}
        >
          {t('tripf.swap')}
        </button>
        <PlaceInput label={t('tripf.to')} value={to} onChange={setTo} />
        <button className="big-btn" type="submit">
          {t('tripf.search')}
        </button>
        {!query && <p className="hint">{t('tripf.hint')}</p>}
      </form>

      {!query && recentTrips.length > 0 && (
        <section>
          <h2 className="section-title">{t('tripf.recent')}</h2>
          <div className="chips">
            {recentTrips.map((r) => (
              <button
                key={r.from + r.to}
                className="chip-btn"
                onClick={() => {
                  setFrom(r.from);
                  setTo(r.to);
                  setQuery(r);
                }}
              >
                {r.from} → {r.to}
              </button>
            ))}
          </div>
        </section>
      )}

      {message && (
        <Empty>
          <TrafficLightIcon size={64} />
          <p>{message}</p>
        </Empty>
      )}

      {plan && plan.results.length > 0 && (
        <>
          <div className="result-bar">
            <b>{t('tripf.found', { n: plan.results.length })}</b>
            <div className="seg">
              {(['fast', 'stops', 'walk'] as TripSort[]).map((s) => (
                <button key={s} className={sort === s ? 'active' : ''} onClick={() => setSort(s)}>
                  {t(`tripf.sort.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {query!.from !== MY_LOCATION && (
            <button className="pill-btn save-trip" onClick={save}>
              {t('tripf.save')}
            </button>
          )}
          {sorted.slice(0, 30).map((r, i) => (
            <TripResultCard
              key={r.route.id}
              r={r}
              live={i < TOP_N}
              onSoonest={(m) => setSoonest((s) => (s[r.route.id] === m ? s : { ...s, [r.route.id]: m }))}
            />
          ))}
          <Footnote />
        </>
      )}
    </div>
  );
}

function PlaceInput({ label, value, onChange, extra }: { label: string; value: string; onChange: (v: string) => void; extra?: React.ReactNode }) {
  const index = useData((s) => s.index)!;
  const [focus, setFocus] = useState(false);
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), 150);
    return () => clearTimeout(id);
  }, [value]);
  const suggestions = useMemo(() => (focus ? index.suggestNames(debounced, 8) : []), [index, debounced, focus]);
  const id = `place-${label}`;
  return (
    <div className="place">
      <label htmlFor={id}>{label}</label>
      <div className="place-input">
        <input
          id={id}
          value={value}
          autoComplete="off"
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => {
            setFocus(true);
            if (e.target.value.startsWith('📍')) onChange('');
          }}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
        />
        {extra}
      </div>
      {suggestions.length > 0 && !(suggestions.length === 1 && suggestions[0] === value) && (
        <ul className="suggest">
          {suggestions.map((s) => (
            <li key={s}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => (onChange(s), setFocus(false))}>
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function TripResultCard({ r, live, onSoonest }: { r: TripResult; live: boolean; onSoonest: (m: number) => void }) {
  const t = useT();
  const now = useNow(30000);
  const eta = usePolling<EtaResult>(
    (force) => getArrivals(r.route.co, r.route.route, r.route.dir, r.route.serviceType, r.board.stopId, r.boardIdx + 1, force),
    [r.route.id, r.board.key],
    live,
  );
  useEffect(() => {
    const first = eta.data?.rows.find((x) => x.eta);
    if (first && eta.data) onSoonest(minutesUntil(first.eta!, first.dataTimestamp, eta.data.fetchedAt, now));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eta.data]);
  const href = routeHref(
    r.route.co,
    r.route.route,
    r.route.dir,
    r.route.serviceType,
    `?stop=${encodeURIComponent(r.board.key)}&board=${r.boardIdx}&alight=${r.alightIdx}`,
  );
  return (
    <article className="card">
      <a className="card-top" href={href}>
        <CompanyBadge co={r.route.co} />
        <span className="route-no">{r.route.route}</span>
        <span className="dest">
          {t('to')} {r.route.destTc}
        </span>
      </a>
      <a className="trip-info" href={href}>
        <div>
          🟢 {t('tripf.boardAt', { s: r.board.nameTc })}{' '}
          <DistanceTag lat={r.board.lat} lng={r.board.lng} walk={false} />
          {r.walk !== undefined && <small className="muted">{t('tripf.walk', { m: r.walk })}</small>}
        </div>
        <div>🔴 {t('tripf.alightAt', { s: r.alight.nameTc })}</div>
        <div className="muted">{t('tripf.summary', { n: r.stops, m: rideMinutes(r.stops) })}</div>
        {r.others.length > 0 && (
          <div className="muted small">{t('tripf.others', { s: r.others.map((o) => `往${o.destTc}`).join('、') })}</div>
        )}
      </a>
      <div className="trip-maps">
        <MapsButton lat={r.board.lat} lng={r.board.lng} />
      </div>
      {live && (
        <div className="trip-next">
          <span className="muted">{t('tripf.next')}</span>
          <ArrivalList result={eta.data} loading={eta.loading} error={eta.error} onRetry={eta.reload} compact />
        </div>
      )}
    </article>
  );
}
