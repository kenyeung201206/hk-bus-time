# HK Bus Time — Ad-free Bus ETA App (KMB + Citybus)

> Build brief for Claude Code. Read this whole file first, then build milestone by milestone (see Section 14).
> Owner: built for a family member. **UI language: Traditional Chinese (繁體中文, Hong Kong) only.** All screen text, buttons, messages and dates are in Traditional Chinese. Stop/route/destination names use the `*_tc` fields from the APIs.

---

## 1. Goal

A fast, **zero-advertisement** mobile app that answers one question: **"When does my bus arrive?"**

- Works on **iPhone and Android**.
- Searches **KMB/LWB and Citybus** in **one** search box.
- **Favourites** list: one tap from opening the app to seeing live arrival times of the buses the user takes every day.
- Shows **the next bus and the one after (up to 3 arrivals)** for every route, same as the official apps.
- **Trip finder:** type a start point and a destination → the app lists which buses go there directly (Section 6.4).
- Free to run, no account, no login, no tracking.

### Why this exists
The official KMB site/app and the Citybus site/app are cluttered with ads, banners and promotions. They also make you pick the company first, then the route, then the direction, then the stop. The user only wants arrival times. This app removes everything else.

---

## 2. Research findings (what the two companies offer)

Both companies publish their real-time data as **free, official Open Data APIs** through the HK Government's DATA.GOV.HK (Transport Department). Both allow commercial and non-commercial reuse subject to the DATA.GOV.HK terms. **Do NOT scrape the kmb.hk / citybus.com.hk web pages** — use these APIs instead. They are stable, JSON, faster, and legal.

| | KMB / LWB | Citybus (CTB) |
|---|---|---|
| Base URL | `https://data.etabus.gov.hk/v1/transport/kmb/` | `https://rt.data.gov.hk/v2/transport/citybus/` (older v1: `https://rt.data.gov.hk/v1/transport/citybus-nwfb/`) |
| Route list | `GET /route/` | `GET /route/CTB` |
| Stop list | `GET /stop` | `GET /stop/{stop_id}` (per stop) |
| Route → stops | `GET /route-stop` (all) or `/route-stop/{route}/{direction}/{service_type}` | `GET /route-stop/CTB/{route}/{inbound\|outbound}` |
| ETA | `GET /eta/{stop_id}/{route}/{service_type}`, `/stop-eta/{stop_id}`, `/route-eta/{route}/{service_type}` | `GET /eta/CTB/{stop_id}/{route}` |
| ETA refresh | every ~1 minute | every ~1 minute |
| Static data refresh | daily | when changed |

> **First task for Claude Code:** call each endpoint with `curl`, save a sample response in `/docs/samples/`, and **confirm the exact field names and the Citybus base URL version (v1 vs v2)** before writing types. The field names below are from memory of the official spec and must be verified against the live responses and the official "API Specification / Data Dictionary" PDFs linked from the DATA.GOV.HK dataset pages:
> - KMB: https://data.gov.hk/en-data/dataset/hk-td-tis_21-etakmb
> - Citybus: https://data.gov.hk/en-data/dataset/ctb-eta-transport-realtime-eta

### Typical fields (verify!)
- **KMB route:** `route, bound ("O"/"I"), service_type, orig_tc/en/sc, dest_tc/en/sc`
- **KMB stop:** `stop, name_tc/en/sc, lat, long`
- **KMB route-stop:** `route, bound, service_type, seq, stop`
- **KMB ETA:** `co, route, dir, service_type, seq, dest_tc/en/sc, eta_seq, eta (ISO-8601 with +08:00 or null), rmk_tc/en/sc, data_timestamp`
- **Citybus route:** `co, route, orig_tc/en/sc, dest_tc/en/sc`
- **Citybus route-stop:** `co, route, dir ("I"/"O"), seq, stop`
- **Citybus stop:** `stop, name_tc/en/sc, lat, long`
- **Citybus ETA:** `co, route, dir, seq, stop, dest_tc/en/sc, eta_seq, eta, rmk_tc/en/sc, data_timestamp`

### Things to know about the data
- Same route number can exist in **both** companies (e.g. joint-operation cross-harbour routes, or different routes with the same number in different areas). The app must show a **company badge** and never merge two different operators' routes into one record.
- KMB routes have a **service_type** (1 = normal, 2+ = special/short-turn variants). Show variants only when they matter (see 6.2).
- Stop IDs are different between companies. Same physical pole = two different IDs. Optional nice-to-have: group "nearby stops from both companies" by GPS distance (<50 m).
- `eta` can be `null` (no scheduled bus / service ended) → look at `rmk_*` for the reason.
- Always show up to **3** upcoming buses per route-stop (`eta_seq` 1–3).
- The Government's data is "estimated"; add a small "Estimated time, for reference only" footer.

---

## 3. Product principles

1. **Zero ads, zero tracking, zero login.** No analytics SDKs. No third-party scripts.
2. **Speed over features.** Cold start → favourites with live times in **< 2 seconds** on 4G.
3. **Big, readable, one-hand use.** The user will use it at a bus stop, in sun/rain, possibly in a hurry.
4. **Works with bad network.** Cached static data, clear offline state, never a blank screen.
5. **Simple mental model:** Favourites (home) · Search · Nearby · Settings.

---

## 4. Recommended tech stack

### Recommendation: **PWA (Progressive Web App)** first, wrap into native later if wanted

Reasons: one codebase for iPhone and Android, no App Store/Play Store fees or review, instant updates, Claude Code builds it fastest, and it installs to the home screen like an app ("Add to Home Screen").

| Layer | Choice |
|---|---|
| Framework | **React + TypeScript + Vite** |
| Styling | Tailwind CSS (mobile-first), CSS variables for dark/light theme |
| State | Zustand (small, simple) |
| Local storage | **IndexedDB via `idb`** (static route/stop data) + `localStorage` (favourites, settings) |
| PWA | `vite-plugin-pwa` (Workbox) — manifest, service worker, offline shell |
| Maps (phase 2) | MapLibre GL JS or Leaflet + OpenStreetMap tiles (free) — do not use Google Maps (cost/keys) |
| Search | `fuse.js` (fuzzy, in-memory) or a hand-written prefix index on route number |
| i18n | Single locale **zh-HK** (Traditional Chinese). Keep every string in `zh-HK.json` (no hard-coded text) so another language can be added later if ever needed |
| Tests | Vitest (logic), Playwright (smoke on mobile viewport) |
| Hosting | **Cloudflare Pages** or GitHub Pages (free, HTTPS — HTTPS is required for PWA) |

### Fallback if later wanted in the app stores
Wrap the same PWA with **Capacitor** (iOS + Android builds) — no rewrite needed. Alternatively choose Flutter/Expo from the start if the owner prefers native; the data layer in Section 5 is framework-independent.

### CORS risk (check on day 1)
Browser apps can only call APIs that send CORS headers. Test both APIs from a browser page (`fetch` from `localhost`). If either blocks CORS:
- Add a tiny **Cloudflare Worker** proxy (`/api/kmb/*`, `/api/ctb/*`) that forwards requests and adds CORS headers. Also caches static endpoints for 24h at the edge — this makes the app faster and is kind to the government servers. Keep it ≤ 50 lines.

---

## 5. Data layer design (the heart of the app)

### 5.1 Unified model

```ts
type Company = 'KMB' | 'CTB';        // LWB is under KMB's API; show as "KMB/LWB"

interface Route {
  id: string;                // `${co}-${route}-${dir}-${serviceType}`
  co: Company;
  route: string;             // "1A", "104", "N368"
  dir: 'O' | 'I';            // outbound / inbound (normalise Citybus inbound/outbound)
  serviceType: number;       // CTB: always 1
  origTc: string; origEn: string;
  destTc: string; destEn: string;
}

interface Stop {
  id: string;                // `${co}-${stopId}`
  co: Company;
  stopId: string;
  nameTc: string; nameEn: string;
  lat: number; lng: number;
}

interface RouteStop { routeId: string; seq: number; stopKey: string; }

interface Favourite {
  id: string;                // uuid
  co: Company; route: string; dir: 'O'|'I'; serviceType: number;
  stopId: string;
  label?: string;            // optional user nickname e.g. "Go to work"
  sortOrder: number;
  createdAt: number;
}

interface Arrival {          // normalised ETA row
  etaSeq: number;
  etaTime: Date | null;      // null = no bus
  minutes: number | null;    // computed, floor, min 0
  remarkTc: string; remarkEn: string;
  destTc: string; destEn: string;
  dataTimestamp: Date;
}
```

### 5.2 Static data sync (routes, stops, route-stops)
- On first launch: download all routes, stops, route-stops for **both** companies → normalise → store in IndexedDB. Show a friendly one-time progress screen ("Preparing bus data… 1 of 2"). KMB's full `/stop` and `/route-stop` are large (a few MB) — fine on first load, never reload each time.
- Citybus has no "all stops" endpoint: build the stop table by fetching `route-stop` for every route, then fetch each unique `stop` with limited concurrency (e.g. 8 parallel), **progressively** and resumable. Better: do this in the optional Worker/GitHub Action (below) and ship a pre-built JSON.
- **Recommended optimisation:** a scheduled **GitHub Action (daily)** that fetches everything, merges KMB + CTB into one compact `bus-data.json` (gzip/brotli) and publishes it with the site. The app then downloads **one** file. Fallback: the app syncs directly if the file is missing.
- Store `dataVersion` + `lastSyncedAt`. Re-sync in the background if older than 24h (stale-while-revalidate). Never block the UI on this.

### 5.3 Live ETA fetching
- **Favourites screen:** for each favourite call the single-stop-route ETA endpoint. Run in parallel (Promise.allSettled), timeout 8 s, retry once.
  - KMB: `/eta/{stop}/{route}/{serviceType}`; filter by `dir` of the returned rows.
  - CTB: `/eta/CTB/{stop}/{route}`; filter by `dir`.
- **Stop page:** use `/stop-eta/{stop}` for KMB (all routes at that stop in one call) when showing a stop.
- **Route page:** use `/route-eta/{route}/{serviceType}` for KMB; for CTB loop over stops (limit concurrency) only for visible stops.
- Auto-refresh every **30 s** while the screen is visible (pause when tab hidden via `visibilitychange`), pull-to-refresh, and a visible "Updated 12 s ago" label.
- De-duplicate in-flight requests and cache responses for 15 s to avoid hammering the APIs.
- **Clock skew:** compute minutes using `eta - data_timestamp` offset against the device clock, so a wrong phone clock doesn't show wrong minutes.

### 5.4 Displaying minutes
- `minutes = max(0, floor((eta - now) / 60000))`
- 0 → **「即將抵達」**; 1+ → **「5 分鐘」**
- Show the next 3 buses like the official app: first bus large and bold, then the 2nd and 3rd smaller: `3 分鐘 · 12 分鐘 · 25 分鐘`.
- No more buses → 「—」. Last bus → red badge 「尾班車」.
- Also show the clock time (e.g. 18:42) in small text under each.
- Remark handling: show `rmk` (e.g. scheduled-timetable only, last bus) as a small badge. If `eta === null` and remark exists → show remark text; if both empty → "No service information / 暫無班次資料".

---

## 6. Features

### 6.1 MVP (Milestones 1–4) — must have
1. **Favourites home screen** (default landing page)
   - Cards: `[KMB]` badge + route number (big) + "To {destination}" + stop name + next 3 arrival times.
   - Pull to refresh; auto-refresh 30 s.
   - Drag to reorder; swipe to delete; long-press to rename (nickname).
   - Empty state with a big "＋ Add your first bus" button.
2. **Unified search** (one box for both companies)
   - Type route number → instant results (prefix match, e.g. "10" → 10, 101, 102, 104…) with company badge, origin → destination.
   - Also search by **stop name** (Chinese or English) and by destination.
   - Big on-screen numeric/route keypad option (like the official apps) in addition to the system keyboard — fast for bus numbers.
   - Recent searches (local only).
3. **Route detail screen**
   - Direction toggle (swap ⇄ button) between the two directions.
   - Ordered stop list with live ETA for each stop (lazy-load visible stops only).
   - ⭐ star next to a stop = add to favourites (one tap). Toast "Added to favourites".
   - Highlight the nearest stop to the user if location is allowed.
4. **Stop detail screen** — all routes (both companies) that serve a stop with live ETAs.
5. **Settings (all labels in Traditional Chinese):** text size (Normal / Large / Extra large), theme (Auto / Light / Dark), refresh interval, clear data, data last updated + "Update bus data now" button, About + data attribution.
6. **PWA install + offline shell**: installable, opens instantly offline with last-known favourites list and a clear "Offline — times not available" banner.
7. **Zero ads / zero analytics.**

### 6.2 Service variants (KMB `service_type`)
Default to the main service (type 1). If a route has special variants, show them in a collapsed "Other services" section with a plain-language label (origin/destination differ). Never show confusing duplicates in the main result list.

### 6.4 Trip Finder (起點 → 目的地) — NEW, MVP feature

**User story:** "I'm at 旺角 and want to go to 銅鑼灣. Which buses can I take, and when is the next one?"

**UI (new tab, or a button on the Search tab — make it the 2nd tab 「搵路線」):**
```
┌───────────────────────────────┐
│ 起點  [ 旺角               ] 📍 │  ← 📍 = use my current location
│        ⇅ (swap)                │
│ 終點  [ 銅鑼灣             ]   │
│            [ 搜尋路線 ]          │
├───────────────────────────────┤
│ 找到 6 條直達巴士               │
│ [KMB] 104  九巴                │
│  上車：旺角警署（步行約 150 米）  │
│  落車：銅鑼灣                    │
│  共 18 個站 · 約 35 分鐘         │
│  下一班： 3分鐘 · 12分鐘 · 25分鐘 │
│  ⭐ 儲存這個行程                  │
├───────────────────────────────┤
│ [CTB] 112 …                    │
└───────────────────────────────┘
```

**Input behaviour**
- Both fields have **autocomplete** (suggest as the user types, debounce 150 ms) from stop names (`name_tc`, also match `name_sc` so Simplified input works). Group suggestions by place name, e.g. 「旺角」 shows 旺角警署, 旺角東站, 旺角街市 …
- If the user types a name and does not pick a suggestion, treat it as "**all stops whose name contains this text**".
- Origin also has 「📍 我的位置」: uses GPS and picks all stops within 400 m.
- Swap button ⇅, recent trips list (local only), and saved trips (see below).
- Optional phase 2: allow place/landmark/address search (e.g. 「香港大學」「海港城」) via a free geocoder (OpenStreetMap Nominatim, rate-limited, or a small bundled list of ~300 popular HK places mapped to coordinates). In v1 stop-name matching is enough; show a hint 「請輸入巴士站名稱，例如：旺角、銅鑼灣」.

**Algorithm (all done on the phone from the offline IndexedDB data — instant, no server)**
1. `O` = set of candidate origin stops, `D` = set of candidate destination stops (name match, or GPS radius). Cap each set at ~60 stops, nearest first when GPS is available.
2. Build once at sync time an inverted index: `stopKey → [(routeId, seq)]`.
3. For every route found at any stop in `O`: look up the same route in the stops of `D`. A route is a **direct match** if there exists a boarding stop `o ∈ O` and an alighting stop `d ∈ D` on the **same route/direction/service_type** with `seq(d) > seq(o)`.
   - If several pairs exist, keep the best: smallest `seq(d) − seq(o)`, tie-break by shortest walk to `o`.
   - Circular routes where a stop appears twice: test every (o, d) pair, don't assume uniqueness.
   - Merge KMB `service_type` variants of the same route: keep the one with the most direct pair; show the others in a collapsed 「其他班次」 line.
4. **Rank** results: (a) has a bus arriving within 30 min first, (b) fewer stops, (c) shorter walk to the boarding stop. Let the user switch sort: 「最快到達 / 最少站數 / 最近上車點」.
5. For the top N (e.g. 10) results fetch live ETA at the boarding stop (same code as Favourites, Section 5.3) and show up to 3 arrivals each; show skeletons while loading; refresh every 30 s.
6. Estimated ride time = `stops × ~1.5 min` (label as 「預計」 — estimate only), or use real timetable/running time if the data provides it.
7. Both companies are searched together; each result carries its company badge. If no direct route exists → show 「找不到直達巴士」 plus the phase‑2 option below.

**Result detail:** tap a result → Route detail screen scrolled to the boarding stop with boarding stop (green) and alighting stop (red) highlighted and the stops in between shaded. Buttons: 「儲存為常用行程」 and 「加入我的巴士」 (adds boarding stop + route to Favourites).

**Saved trips (常用行程):** save the origin/destination pair (e.g. 「返工：屋邨 → 中環」). On the Favourites home screen, a saved trip is a card that re-runs the search and shows the top 1–2 direct buses with their live next 3 arrivals. This replaces looking up the same trip every day.

**Phase 2 of the trip finder (after MVP, M6+)**
- **One-transfer journeys** (A → bus 1 → interchange → bus 2 → B): find pairs of routes whose stops are within ~200 m of each other (precompute a "stop proximity" table in the daily data build, grid-bucketed by lat/lng for speed). Always show direct options first. Mark the interchange stop and walking distance.
- Fare per option (DATA.GOV.HK fare datasets for KMB/Citybus) and the total.
- Include MTR/GMB later via new adapters.
- "Leave at / Arrive by" times, and walking directions to the boarding stop (open the phone's Maps app with a deep link rather than building navigation ourselves).

**Tests for the trip finder** (use saved sample data in `docs/samples`): direct route found when `seq(d) > seq(o)`; opposite direction is NOT returned; circular route; same stop name in both companies; origin = destination (show message); no match; Simplified input; GPS origin with radius; performance < 200 ms for a search on a mid-range phone.

### 6.3 Strongly recommended additions (things you didn't mention)
Ordered by value to a daily commuter:

| # | Feature | Why it matters |
|---|---|---|
| 1 | **Nearby stops** (GPS) — list stops within 300 m of the user with live ETAs for both companies | The #1 use case when standing somewhere unfamiliar |
| 2 | **"Go to work / Go home" smart groups** — favourites grouped (Morning / Evening / Custom folders) and **auto-sorted by time of day** (show the morning group first before noon) | Zero taps to the right info |
| 3 | **Compare same-stop buses**: a favourite can contain several routes at the same stop (e.g. 101 + 102 + 104 both go to her destination) shown as one "which comes first" card | Takes the first bus that gets her there |
| 4 | **Arrival notifications / alarm** ("Notify me when the 5 bus is 3 min away") | Lets her stay in the shop/office until the last minute. Web Push works on Android and on iOS 16.4+ **only when installed to Home Screen**; true background timing is unreliable on a PWA — be honest in UI; reliable alarms need the Capacitor/native build (phase 3) |
| 5 | **Home-screen widget / quick shortcuts** | Native-only (phase 3). On PWA: add manifest `shortcuts` for top favourites |
| 6 | **Last-bus warning** — if remark says last bus, or the final scheduled ETA, show a red badge | Avoids getting stranded |
| 7 | **Service alerts / route diversions** note | KMB site warns of temporary diversions; consider linking "Check operator notices" to official pages (no scraping) |
| 8 | **Share a stop/route link** (deep link `/#/stop/KMB/ABC123`) | Send the user's bus to family |
| 9 | **Fare + journey time info** (KMB `route-fare` / fares dataset on DATA.GOV.HK) | Optional info row on route page |
| 10 | **Map view** of route with live bus-stop highlight | Nice but not core — phase 2 |
| 11 | **Backup / restore favourites** (export/import JSON, or a QR/share code) | Changing phone shouldn't lose favourites; no login needed |
| 12 | **Accessibility**: VoiceOver/TalkBack labels, high contrast, ≥ 48 px touch targets, large-text mode, no colour-only indicators | Daily-use quality and elderly relatives |
| 13 | **Transfer journeys** (A → interchange → B) | Direct-bus Trip Finder is now in MVP (6.4); transfers are its phase 2 |
| 14 | **Other operators** — GMB minibus, MTR buses, NLB (Lantau) have open APIs too | Same architecture; add as `Company` values later. Design the `Company` type and adapters so adding one is a single new file |
| 15 | **Delay / "bus not moving" hint** | If the same ETA doesn't change for several refreshes, show "Time may be inaccurate" |

---

## 7. Screens & UX

Bottom tab bar (5 tabs, thumb-reachable, Traditional Chinese labels): **⭐ 我的巴士 (Favourites) · 🔍 搜尋 (Search) · 🧭 搵路線 (Trip finder) · 📍 附近 (Nearby) · ⚙ 設定 (Settings)**

### Favourites (home)
```
┌───────────────────────────────┐
│ My buses            Updated 8s │
├───────────────────────────────┤
│ [KMB] 1A   → Star Ferry        │
│ Tsim Sha Tsui East Stn  (to work) │
│   3 min      12 min    25 min  │
├───────────────────────────────┤
│ [CTB] 112  → Sai Wan Ho        │
│ Whitty Street                  │
│   Arriving   9 min     —       │
└───────────────────────────────┘
```
- Route number: 28–32 px bold. Next arrival: 24 px bold. Company badge: KMB = red, CTB = yellow/amber (pure colour hints, always paired with text label).
- Skeleton loaders while fetching. Errors are per-card ("Can't load · Tap to retry"), never full-screen.

### Search
Search field at the top (placeholder 「輸入巴士路線或巴士站」), route keypad button, results list grouped: **Routes** / **Stops**. Tap route → Route detail. Result row = `[KMB] 104  Kwun Tong → Kowloon Tong`.

### Route detail
Header: route + company + `origin → destination` + ⇄ swap direction. Stop list with timeline line, stop sequence, name, star button, ETA chips. Tapping a stop expands to show 3 arrivals; auto-scroll to nearest stop.

### Design system
- Clean, white/near-black, lots of whitespace, one accent colour. System font stack with CJK fallbacks (`-apple-system, "PingFang HK", "Noto Sans HK", "Noto Sans TC", sans-serif`).
- Respect safe areas (`env(safe-area-inset-*)`) for iPhone notch/home bar.
- Haptic-free, animation-light. Support `prefers-reduced-motion`, `prefers-color-scheme`.

---

## 8. Project structure

```
hk-bus-time/
├─ docs/
│  ├─ samples/                # saved API responses used in tests
│  └─ API_NOTES.md            # confirmed field names + quirks found
├─ scripts/
│  └─ build-bus-data.ts       # fetch + merge KMB & CTB → public/bus-data.json
├─ worker/                    # optional Cloudflare Worker CORS proxy + cache
├─ src/
│  ├─ api/
│  │  ├─ kmb.ts               # raw KMB calls
│  │  ├─ ctb.ts               # raw Citybus calls
│  │  └─ index.ts             # `getArrivals(fav)`, adapter interface
│  ├─ data/
│  │  ├─ db.ts                # IndexedDB (idb)
│  │  ├─ sync.ts              # static data download/refresh
│  │  └─ normalise.ts         # → unified types
│  ├─ store/                  # zustand: favourites, settings, arrivals
│  ├─ features/
│  │  ├─ favourites/ search/ route/ stop/ nearby/ settings/
│  ├─ components/             # ArrivalChip, CompanyBadge, StopRow, ...
│  ├─ i18n/                   # zh-HK.json only
│  ├─ utils/                  # time.ts, geo.ts (haversine), debounce
│  ├─ App.tsx, main.tsx, router (hash router for static hosting)
├─ public/ (icons, manifest, bus-data.json)
├─ .github/workflows/         # daily data build + deploy
└─ README.md
```

Adapter pattern so more operators can be added easily:

```ts
interface OperatorAdapter {
  co: Company;
  fetchRoutes(): Promise<Route[]>;
  fetchStops(): Promise<Stop[]>;
  fetchRouteStops(): Promise<RouteStop[]>;
  fetchArrivals(route: Route, stopId: string): Promise<Arrival[]>;
}
```

---

## 9. Reliability, performance, edge cases

- **Rate-limiting / politeness:** cap concurrent requests (≤ 8), cache ETA 15 s, no polling in the background, pause when hidden.
- **API down / slow:** per-card error with retry; keep showing the last good value greyed out with "as of 18:41".
- **Overnight / no service:** `eta null` + remark → "Service ended" message.
- **Same stop name, different poles:** always show stop ID suffix or direction hint ("towards Central") in disambiguation lists.
- **Route changes:** if a favourite's route/stop no longer exists after a data sync → mark it "Route changed — tap to fix" instead of crashing.
- **Time zone:** treat all times as Asia/Hong_Kong (+08:00) regardless of device zone.
- **Large lists:** virtualise stop and search lists.
- **Chinese search:** support Traditional + Simplified input (use `name_sc` too); case-insensitive route numbers ("n368" = "N368").
- **Bundle size:** target < 250 KB JS gzipped for the shell; lazy-load map and i18n English pack.
- **Lighthouse:** PWA ≥ 90, Performance ≥ 90, Accessibility ≥ 95 on mobile.

---

## 10. Privacy & legal

- No accounts, no analytics, no ads. Favourites stay **on the device** only.
- Location is used only on-device for Nearby; coordinates are never sent anywhere (stops are filtered locally).
- Include an About screen: "Data provided by Transport Department / KMB / Citybus via DATA.GOV.HK. Times are estimates." Link the DATA.GOV.HK terms. Do not use KMB/Citybus logos or trademarks as the app's own branding; use a neutral name/icon (placeholder name: "HK Bus Time" — owner can rename).
- This is a personal/family app. If published publicly, re-check DATA.GOV.HK terms and each operator's attribution requirements.

---

## 11. Testing

- **Unit (Vitest):** minute calculation, remark parsing, normalisers using saved samples in `docs/samples`, search ranking ("1" shows 1, 1A, 10…), favourite reordering, direction mapping CTB `inbound/outbound` ↔ `I/O`.
- **Mocked E2E (Playwright, iPhone 14 + Pixel 7 viewports):** add favourite → appears on home → delete → empty state; offline mode shows banner.
- **Manual device test checklist:** install to Home Screen on a real iPhone (Safari → Share → Add to Home Screen) and a real Android phone (Chrome → Install app). Test with airplane mode; test outdoors for readability.

---

## 12. Deployment & how the user installs it

1. Push to GitHub; GitHub Action builds and deploys to **Cloudflare Pages** (or GitHub Pages).
2. Send her the URL.
3. **iPhone:** open in **Safari** → Share → **Add to Home Screen**.
4. **Android:** open in Chrome → ⋮ → **Install app** / Add to Home screen.
5. Updates are automatic the next time she opens the app (service worker "new version available — tap to refresh" toast).

Include a short, picture-friendly `INSTALL.md` for her in Chinese.

---

## 13. Out of scope for v1 (do not build yet)

Multi-transfer journey planner and MTR/minibus mixed routing (direct-bus Trip Finder IS in scope), user accounts/cloud sync, payments, social features, MTR/tram/ferry, in-app messaging, any advertising.

---

## 14. Milestones (give these to Claude Code one at a time)

**M0 — API discovery (½ day).** `curl` every endpoint for both companies; save samples in `docs/samples`; write `docs/API_NOTES.md` with the confirmed field names, CORS results, data sizes, Citybus v1/v2 decision. Decide whether the Worker proxy is needed. *Do not proceed until verified.*

**M1 — Skeleton.** Vite + React + TS + Tailwind + PWA plugin + router + bottom tabs + i18n + theme; deploy "hello" to hosting to verify install on both phones.

**M2 — Data layer.** Adapters for KMB + CTB, normalisers, IndexedDB, sync script/Action producing `bus-data.json`, first-launch download screen. Unit tests on samples.

**M3 — Search + Route + Stop screens with live ETA.** Unified search (route/stop/destination), direction swap, ETA chips, refresh logic, error states.

**M4 — Trip finder (起點→目的地, direct buses).** Section 6.4: autocomplete, GPS origin, matching algorithm on the offline index, ranked results with live next-3 arrivals, result detail with highlighted board/alight stops, recent trips. Unit tests listed in 6.4.

**M4b — Favourites.** Add/remove/reorder/rename, home screen live cards, empty state, groups (Work/Home), export/import backup. **← MVP complete. Hand to the user for real-world testing for a week.**

**M5 — Saved trips on the home screen, Nearby stops (GPS), last-bus badge, text-size & high-contrast settings, share links, stale-data handling.**

**M6 — Polish:** accessibility audit, Lighthouse tuning, icons/splash screens, INSTALL.md, README.

**M7 (optional) — Trip finder with one transfer + fares; map view; Web Push alarms; Capacitor wrapper for App Store/Play Store + home-screen widget; add GMB/MTR-bus/NLB adapters.**

### Definition of done for each milestone
Builds with no TS errors, tests pass, works at 375 px width, tested on a real phone, README updated.

---

## 15. Suggested first prompt to Claude Code

> Read `BUS_APP_SPEC.md`. Start with **M0**: call the KMB and Citybus open-data endpoints listed in Section 2, save sample responses under `docs/samples/`, test CORS from a browser context, and write `docs/API_NOTES.md` with confirmed field names and any differences from the spec. Then propose any changes to the spec before we start M1. Don't write app code yet.

---

## 16. Open questions for the owner (answer before M1)

1. App name and icon preference? (Placeholder: "HK Bus Time")
2. ~~Language~~ — decided: Traditional Chinese only.
3. Does the user also use **minibus (GMB)** or **MTR** feeders often? If yes, move GMB up to v1.
4. Is **notification alarm** a must-have? If yes, plan the Capacitor native wrapper earlier (PWA can't guarantee timing).
5. Does she want it in the **App Store / Google Play**? (Apple Developer = US$99/yr, Google Play = US$25 one-off.) Otherwise the free PWA is enough.
6. Which 3–5 bus routes/stops does she use daily? (Use them as the real-world test cases.)
