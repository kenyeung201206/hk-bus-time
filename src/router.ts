import { useSyncExternalStore } from 'react';

// Hash router so the app works on any static host: #/fav, #/route/KMB/1A/O/1?stop=ABC
export interface Loc {
  path: string[];
  query: URLSearchParams;
}

const parse = (): Loc => {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p ? p.split('/').map(decodeURIComponent) : ['fav'], query: new URLSearchParams(q) };
};

let current = parse();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => {
  current = parse();
  subs.forEach((f) => f());
});

export const useLoc = () =>
  useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => current,
  );

export const go = (path: string) => {
  location.hash = '#/' + path.replace(/^#?\/?/, '');
};

export const routeHref = (co: string, route: string, dir: string, st: number, extra = '') =>
  `#/route/${co}/${encodeURIComponent(route)}/${dir}/${st}${extra}`;

export const stopHref = (key: string) => `#/stop/${encodeURIComponent(key)}`;
