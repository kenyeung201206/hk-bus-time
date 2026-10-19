# HK Bus Time 巴士到站

Ad-free KMB + Citybus arrival times as an installable web app (PWA). Traditional Chinese UI.
No ads, no tracking, no login — favourites stay on the phone.

## Three cute patterns
Choose in 設定 → 主題風格. Each pattern changes the colours, the background pattern, the **font** and some of the **wording**:

| Pattern | Look | Font | Wording example |
|---|---|---|---|
| 🍓 草莓牛奶 | pink, polka dots + hearts, dashed cards | Huninn 粉圓 (rounded) | 「即將到站囉」 🐰 |
| 🐳 薄荷汽水 | mint + sky blue, bubbles | Chiron GoRound TC (rounded sans) | 「嚟緊喇」 🫧 |
| 🦄 彩虹糖果 | lavender, stars, rainbow card edges | LXGW WenKai TC (handwriting) | 「快到喇」 ✨ |

Each pattern has light and dark versions (自動 / 淺色 / 深色), plus 3 text sizes.
Patterns live in `src/themes.ts` (name, mascot, font, wording) and `src/styles.css` (colour tokens).

## Features
- ⭐ 我的巴士: live next 3 buses per favourite, auto refresh (15/30/60 s, paused when hidden), pull to refresh,
  edit mode (reorder, rename, delete, morning/evening groups sorted by time of day), long-press to rename, saved trips.
- 🔍 搜尋: one box for both companies (route prefix, stop name in 繁/简/English, destination), route keypad, recent searches.
- Route page: direction swap, other service types, timeline with live ETA (KMB: whole route in one call), ★ to favourite,
  nearest stop highlight (when location already allowed), share link.
- Stop page: every route at the stop with live ETAs, plus the other company's poles within 50 m.
- 🧭 搵路線: start → destination direct buses from both companies (offline index), 📍 my location, sort by
  最快到達 / 最少站數 / 最近上車點, live next 3 buses, save as 常用行程 (shown on home).
- 📍 附近: stops within 300 m (location stays on the phone).
- 📍 Always-on location (switch in 設定): the route page shows 「最近你嘅車站」 with distance and walking time and
  opens that stop; favourites, search results, stop pages, trip results and 附近 show how far each stop is.
- ⭐ Favourite a whole line (「☆ 收藏成條路線」 on a route page): no stop to pick — the card always uses the stop
  nearest to you and switches as you move.
- 🗺️ Every stop has a 「帶我去車站」 button that opens Google Maps walking directions to it.
- 🔔 到站語音提醒: tap the bell on a favourite (or on a stop in a route page) to be told in Cantonese
  「巴士仲有十分鐘就到喇！」. You choose when it starts (any number of minutes) and how often it repeats
  (every 1–5 min) down to 1 minute, e.g. 10 → 7 → 4 → 1. Switch on/off, voice (可愛女聲 / 親切男聲 / 手機內置)
  and keep-screen-on in 設定. Works while the app is open with the screen on (a web app can't speak when locked).
- Cute SVG buses in each company's colours (九巴 red/cream, 城巴 yellow) on cards and badges, plus little
  traffic friends (traffic light, bus stop, map pin, gear) on every page.
- 設定: pattern, dark mode, text size, refresh interval, update bus data, backup export/import, clear data, about.
- Offline: app shell + bus data cached; offline banner.

## Develop
```bash
npm install
npm run data      # fetch KMB + CTB static data → public/bus-data.json (~3 min, Node 22.6+)
npm run dev
npm test
npm run build     # → dist/
```

## Deploy
`.github/workflows/deploy.yml` rebuilds `bus-data.json` daily and deploys `dist/` to GitHub Pages
(enable Pages → "GitHub Actions" in the repo settings). Any static HTTPS host works (Cloudflare Pages, Netlify…).

## Notes / deviations from the spec
- Plain CSS variables instead of Tailwind — the three patterns are just token sets, which is simpler without Tailwind.
- No CORS proxy: both APIs allow `*` (see `docs/API_NOTES.md`).
- Trip finder treats a typed place as all stops whose name contains it **plus stops within 250 m of those**,
  because many stops are named after streets (e.g. Causeway Bay stops on 軒尼詩道).
- The three fonts load from Google Fonts (cached by the service worker); system fonts are used until then / offline.
- Not built yet: swipe-to-delete/drag-reorder gestures (edit mode buttons instead), Playwright E2E,
  arrival notifications, transfer journeys, map view.

Voice clips (`public/voice/`): pre-recorded once with Microsoft's zh-HK neural voices (HiuGaai, WanLung)
via the open-source `edge-tts` tool — see `scripts/gen_voice.py`. They play offline with no API key.
For an official route (e.g. if the app is ever published commercially), regenerate them with Azure Speech.

Data: Transport Department / KMB / Citybus via DATA.GOV.HK. Times are estimates.
