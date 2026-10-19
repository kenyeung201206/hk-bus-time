import { LineIcon } from './components/icons';
import { LocationWatcher } from './location';
import { AlertManager } from './alerts/Alerts';
import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useLoc } from './router';
import { useData } from './data/sync';
import { useSettings } from './store';
import { useT } from './i18n';
import { useOnline } from './hooks';
import { Toast } from './components/common';
import { themeById } from './themes';
import { FavouritesScreen } from './features/Favourites';
import { SearchScreen } from './features/Search';
import { TripFinderScreen } from './features/TripFinder';
import { NearbyScreen } from './features/Nearby';
import { SettingsScreen } from './features/Settings';
import { RouteDetailScreen } from './features/RouteDetail';
import { StopDetailScreen } from './features/StopDetail';
import type { Company, Dir } from './types';

const TABS = [
  { id: 'fav', icon: '⭐' },
  { id: 'search', icon: '🔍' },
  { id: 'trip', icon: '🧭' },
  { id: 'nearby', icon: '📍' },
  { id: 'settings', icon: '⚙️' },
];

export function App() {
  const t = useT();
  const loc = useLoc();
  const { status, progress, load } = useData();
  const { theme, mode, textSize } = useSettings();
  const online = useOnline();
  const cool = themeById(theme).style === 'cool';
  const sw = useRegisterSW();

  useEffect(() => {
    load();
  }, [load]);

  // apply the chosen pattern to the whole page
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = themeById(theme).id;
    root.dataset.style = themeById(theme).style;
    root.dataset.mode = mode;
    root.dataset.text = textSize;
    const meta = document.querySelector('meta[name="theme-color"]');
    meta?.setAttribute('content', getComputedStyle(root).getPropertyValue('--bg').trim() || '#fff');
  }, [theme, mode, textSize]);

  const [page, ...rest] = loc.path;
  const tab = ['route', 'stop'].includes(page) ? '' : page;

  let screen: React.ReactNode;
  if (status !== 'ready' && page !== 'settings') {
    screen = <LoadingScreen status={status} progress={progress} retry={() => (useData.setState({ status: 'idle' }), load())} />;
  } else if (page === 'route') {
    const [co, route, dir, st] = rest;
    screen = <RouteDetailScreen key={rest.join('/')} co={co as Company} route={route} dir={dir as Dir} st={+st || 1} query={loc.query} />;
  } else if (page === 'stop') {
    screen = <StopDetailScreen key={rest[0]} stopKey={rest[0]} />;
  } else if (page === 'search') screen = <SearchScreen />;
  else if (page === 'trip') screen = <TripFinderScreen />;
  else if (page === 'nearby') screen = <NearbyScreen />;
  else if (page === 'settings') screen = <SettingsScreen />;
  else screen = <FavouritesScreen />;

  return (
    <div className="app">
      <div className="bg-pattern" aria-hidden />
      {!online && <div className="offline-banner">📡 {t('offline')}</div>}
      {sw.needRefresh[0] && (
        <button className="update-banner" onClick={() => sw.updateServiceWorker(true)}>
          ✨ {t('updateReady')}
        </button>
      )}
      <main className="main">{screen}</main>
      <nav className="tabbar" aria-label="主選單">
        {TABS.map((x) => (
          <a key={x.id} href={`#/${x.id}`} className={tab === x.id || (!tab && !page && x.id === 'fav') ? 'active' : ''}>
            <span className="tab-icon" aria-hidden>
              {cool ? <LineIcon name={x.id as 'fav'} /> : x.icon}
            </span>
            <span className="tab-label">{t(`tab.${x.id}`)}</span>
          </a>
        ))}
      </nav>
      <LocationWatcher />
      <AlertManager />
      <Toast />
    </div>
  );
}

function LoadingScreen({
  status,
  progress,
  retry,
}: {
  status: string;
  progress: { step: number; total: number; done: number; of: number };
  retry: () => void;
}) {
  const t = useT();
  const mascot = themeById(useSettings((s) => s.theme)).mascot;
  const pct = Math.round(((progress.step - 1 + progress.done / Math.max(1, progress.of)) / progress.total) * 100);
  return (
    <div className="loading-screen">
      <div className="mascot bounce">{mascot}</div>
      {status === 'error' ? (
        <>
          <p>{t('loading.fail')}</p>
          <button className="big-btn" onClick={retry}>
            {t('retry')}
          </button>
        </>
      ) : (
        <>
          <p>{t('loading.title')}</p>
          <div className="progress">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="muted">{t('loading.step', { a: progress.step, b: progress.total })}</p>
        </>
      )}
    </div>
  );
}
