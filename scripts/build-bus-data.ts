// Builds public/bus-data.json (all KMB + CTB routes, stops, route-stops).
// Run: npm run data   (needs Node 22.6+ for native TypeScript)
import { writeFileSync, mkdirSync } from 'node:fs';
import { fetchAllBusData } from '../src/data/fetchAll.ts';

// The government WAF blocks requests that don't look like a browser.
const headers = { 'User-Agent': 'Mozilla/5.0 (HK Bus Time data build)', Accept: 'application/json' };

let last = '';
const data = await fetchAllBusData({
  headers,
  concurrency: 8,
  onProgress: (msg, done, total) => {
    const line = `${msg} ${done}/${total}`;
    if (done === total || done % 200 === 0) {
      if (line !== last) console.log(line);
      last = line;
    }
  },
});

mkdirSync('public', { recursive: true });
writeFileSync('public/bus-data.json', JSON.stringify(data));
console.log(
  `routes=${data.routes.length} stops=${Object.keys(data.stops).length} routeStops=${Object.keys(data.routeStops).length}`,
);
