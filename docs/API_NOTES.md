# API notes (M0, checked 2026-10-19)

Samples are in `docs/samples/`.

## Base URLs
- KMB: `https://data.etabus.gov.hk/v1/transport/kmb`
- Citybus: **v2** `https://rt.data.gov.hk/v2/transport/citybus` (v1 `citybus-nwfb` not used)

## CORS
Both APIs return `Access-Control-Allow-Origin: *`. **No Worker proxy is needed.**

## WAF quirk
The government CDN blocks requests that don't look like a browser ("Service unavailable – The request is blocked"),
e.g. PowerShell's default User-Agent. Browsers are fine. The Node build script sends a browser-like `User-Agent`.

## Confirmed fields (differences from the spec in **bold**)
| Endpoint | Fields |
|---|---|
| KMB `/route/` | `route, bound ("O"/"I"), service_type (**string**), orig_tc/en/sc, dest_tc/en/sc` |
| KMB `/stop` | `stop, name_tc/en/sc, lat (**string**), long (**string**)` — ~1.2 MB |
| KMB `/route-stop` | `route, bound, service_type (string), seq (**string**), stop` — ~3 MB |
| KMB `/eta/{stop}/{route}/{st}` | `co, route, dir, service_type (**number**), seq (number), dest_*, eta_seq, eta (ISO +08:00 or null), rmk_*, data_timestamp` |
| CTB `/route/CTB` | `co, route, orig_*, dest_*, data_timestamp` — one row per route (outbound orientation); inbound = swap orig/dest |
| CTB `/route-stop/CTB/{route}/{outbound\|inbound}` | `co, route, dir ("O"/"I"), seq (**number**), stop, data_timestamp` |
| CTB `/stop/{id}` | `stop, name_tc/en/sc, lat, long (strings), data_timestamp` |
| CTB `/eta/CTB/{stop}/{route}` | `co, route, dir, seq, stop, dest_*, eta_seq, eta, rmk_*, data_timestamp` — `data: []` when no service |

## Other notes
- KMB `eta` returns **both directions** for the stop → filter by `dir` (and `service_type`).
- KMB stop names often end with a stop code, e.g. `中秀茂坪 (KT975)`, `曉茵邨 (KT512a)` — stripped in the UI.
- Remarks seen: `最後班次已過` (final bus departed, `eta: null`), `原定班次` (scheduled, not live).
- Citybus has no "all stops" endpoint: the build script fetches ~800 route-stop lists + ~2,600 stops (8 parallel, ~2–3 min).
- Data size: `bus-data.json` ≈ 2.4 MB raw (2,301 route-directions, 9,369 stops), served compressed by the host.
