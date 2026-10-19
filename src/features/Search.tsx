import { SearchBusIcon } from '../components/icons';
import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useData } from '../data/sync';
import { useFavs } from '../store';
import { useT } from '../i18n';
import { CompanyBadge, Empty, Header } from '../components/common';
import { go, routeHref, stopHref, useLoc } from '../router';

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', '0', 'X', 'B', 'E', 'K', 'M', 'N', 'P', 'R', 'S'];

export function SearchScreen() {
  const t = useT();
  const loc = useLoc();
  const index = useData((s) => s.index);
  const { recentSearches, pushRecentSearch } = useFavs();
  const [q, setQ] = useState(loc.query.get('q') ?? '');
  const [keypad, setKeypad] = useState(true);
  const dq = useDeferredValue(q);

  useEffect(() => {
    const fromUrl = loc.query.get('q');
    if (fromUrl) setQ(fromUrl);
  }, [loc]);

  const routes = useMemo(() => (index && dq ? index.searchRoutes(dq) : []), [index, dq]);
  const stops = useMemo(() => {
    if (!index || !dq.trim() || /^[A-Za-z]?\d+[A-Za-z]?$/.test(dq.trim())) return [];
    return index.stopsMatching(dq, 40);
  }, [index, dq]);

  const remember = () => q.trim() && pushRecentSearch(q.trim());

  return (
    <div>
      <Header title={t('tab.search')} icon={<SearchBusIcon />} />
      <div className="search-box">
        <span aria-hidden>🔍</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setKeypad(false)}
          placeholder={t('search.placeholder')}
          aria-label={t('search.placeholder')}
          autoComplete="off"
        />
        {q && (
          <button className="icon-btn" onClick={() => setQ('')} aria-label={t('search.clear')}>
            ✕
          </button>
        )}
        <button className={`pill-btn ${keypad ? 'active' : ''}`} onClick={() => setKeypad(!keypad)}>
          ⌨ {t('search.keypad')}
        </button>
      </div>

      {!q && recentSearches.length > 0 && (
        <section>
          <h2 className="section-title">{t('search.recent')}</h2>
          <div className="chips">
            {recentSearches.map((r) => (
              <button key={r} className="chip-btn" onClick={() => setQ(r)}>
                {r}
              </button>
            ))}
          </div>
        </section>
      )}

      {q && routes.length === 0 && stops.length === 0 && <Empty>{t('search.noResult')}</Empty>}

      {routes.length > 0 && (
        <section>
          <h2 className="section-title">{t('search.routes')}</h2>
          <ul className="list">
            {routes.map((g) => {
              const r = g.main[0];
              return (
                <li key={`${g.co}-${g.route}`}>
                  <a
                    className="row"
                    href={routeHref(r.co, r.route, r.dir, r.serviceType)}
                    onClick={remember}
                  >
                    <CompanyBadge co={g.co} />
                    <span className="route-no small">{g.route}</span>
                    <span className="row-text">
                      {r.origTc} → {r.destTc}
                      {g.main.length > 1 && <small className="muted"> ⇄</small>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {stops.length > 0 && (
        <section>
          <h2 className="section-title">{t('search.stops')}</h2>
          <ul className="list">
            {stops.map((s) => {
              const rs = index!.routesAtStop(s.key);
              const names = [...new Set(rs.map((x) => x.route.route))];
              return (
                <li key={s.key}>
                  <a className="row" href={stopHref(s.key)} onClick={remember}>
                    <CompanyBadge co={s.co} />
                    <span className="row-text">
                      {s.nameTc}
                      <small className="muted">
                        {' '}
                        {names.slice(0, 6).join(' · ')}
                        {names.length > 6 ? ' …' : ''}
                      </small>
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {keypad && (
        <div className="keypad" role="group" aria-label={t('search.keypad')}>
          {KEYS.map((k) => (
            <button key={k} onClick={() => setQ((x) => x + k)}>
              {k}
            </button>
          ))}
          <button className="wide" onClick={() => setQ((x) => x.slice(0, -1))} aria-label="刪除">
            ⌫
          </button>
          <button onClick={() => setQ('')}>
            {t('search.clear')}
          </button>
          <button className="wide" onClick={() => routes[0] && (remember(), go(routeHref(routes[0].co, routes[0].route, routes[0].main[0].dir, routes[0].main[0].serviceType)))}>
            ✓
          </button>
        </div>
      )}
    </div>
  );
}
