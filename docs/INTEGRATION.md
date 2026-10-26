# Tracker, reports and API

## Install

Place the generated script in every page's head. Keep the ID public: it identifies
the counter, it is not an admin key. Allowed domains are exact hostnames including
non-default ports. Add `example.com` and `www.example.com` separately if necessary.

```html
<script defer src="https://analytics.example.com/om.js"
  data-site="SITE_ID" data-replay="true"></script>
```

`data-host` optionally sets the collector origin when om.js is served elsewhere.
For a restrictive site CSP allow the collector in `connect-src` and its script in
`script-src`. The tracker bundles rrweb; it does not download anything from a CDN.
The dashboard should be served at an origin root, not a rewritten subdirectory.

## Consent and private content

```html
<script defer src="https://analytics.example.com/om.js"
  data-site="SITE_ID" data-consent="required" data-replay="true"></script>
```

Call after the tracker loads:

```js
om('consent', true)   // Begin collection after permission
om('consent', false)  // Stop collection and clear this site's stored identifiers
```

For commands before load, define a queue in your own first-party bundle:

```js
window.om = window.om || function (...args) { (window.om.q ||= []).push(args) }
```

No session is created until tracking is enabled. DNT=1 and GPC=true prevent start,
including consent mode. Never override these preferences to make a test pass.
Visitor IDs are random and stored in localStorage per site. Session IDs use
sessionStorage; inactive sessions roll over after 30 minutes. New tabs may create
separate sessions. Cross-device merging and fingerprinting are not implemented.

All inputs are masked by rrweb. `om-block` or `data-om-private` excludes a subtree;
`om-mask` masks its text. Private pages can still contain personal information in
plain text, image URLs, attributes or third-party widgets: disable recording there
or mark all private regions. Never send real personal data in custom event props.
Only URL pathnames are stored for page/link reports; tracker UTM fields and
referrer hostname are handled separately. No full IP address is persisted.

## Goals

Create a JavaScript event goal named `lead_sent`, then send it only after a confirmed
successful lead action:

```js
om('event', 'lead_sent', { form: 'request', plan: 'business' })
// 'goal' is an alias for 'event':
om('goal', 'lead_sent')
```

Page goals use exact paths (no query or hash). Goals are not backfilled. Event IDs
make transport retries idempotent. Supported automatic events: `form_submit`,
`click_phone`, `click_email`; they still need a matching configured goal to count
as conversions. An HTML submit can be rejected by the site's server; use your own
goal for successful submissions. Conversion rates count unique sessions.

## Purchases

```js
om('ecommerce', {
  action: 'purchase', order_id: 'ORD-123', revenue: 5000, currency: 'RUB',
  items: [{ id: 'audit', name: 'Website audit', price: 5000, quantity: 1 }]
})
```

The same order ID is counted once per site. Refunds and updates to a submitted
order are not yet supported. Currencies are kept separate; product revenue is the
sum of item price × quantity, while order revenue is the supplied order total.

## Ad costs

Upload UTF-8 CSV in Acquisition. Delimiters: comma/semicolon. Quoting, escaped quotes,
multiline quoted fields and a UTF-8 BOM are supported. Up to 10,000 rows / 2 MB.

```csv
day,source,campaign,currency,amount
2026-10-25,yandex,brand,RUB,12000
2026-10-25,telegram,launch,RUB,5000
```

The key `(day, source, campaign, currency)` replaces the previous amount, preventing
duplicate spend on retry. ROAS = tracked order revenue / imported cost. Source and
campaign must exactly match the tracker UTM values. Acquisition costs cannot be
split by device/path/goal segments; clear these filters for this report.

## Reporting API

Create a read-only API key in site settings. It is shown once and stored hashed.

```sh
# Put your key in OPENMETRIKA_API_KEY in your shell, not in the URL.
curl -H "Authorization: Bearer $OPENMETRIKA_API_KEY" \
  'https://analytics.example.com/api/sites/SITE_ID/overview?days=30'
```

GET endpoints (all under `/api/sites/:siteId/`):

| Path | Result |
|---|---|
| `overview` | Current/previous KPIs, daily visits, live users, currency revenue |
| `reports/:dimension` | Source/campaign/page/entry/exit/device/browser/OS/country/event/performance/error rows |
| `visits` | Latest 250 matching sessions |
| `visits/:id` | Session and up to 5,000 chronological events |
| `visits/:id/replay` | Ordered rrweb events |
| `goals` | Goal completion and conversion counts |
| `funnels` | Ordered within-session funnel counts |
| `behavior` | Click/scroll/link/form aggregates |
| `map-snapshot` | A matching recorded DOM snapshot for click overlays |
| `ecommerce` | Full revenue totals, orders (latest 5,000), product aggregates |
| `acquisition` | Imported costs, tracked revenue, ROAS and CPA |

Dimensions: `sources`, `campaigns`, `pages`, `entry`, `exit`, `devices`, `browsers`,
`os`, `countries`, `events`, `performance`, `errors`, `retention`. Add `format=csv` to a dimension
report for spreadsheet-safe CSV. Spreadsheet formula prefixes are escaped.

Filters: `days=1|7|30|90` or `from=YYYY-MM-DD&to=YYYY-MM-DD` (UTC, maximum 366 days),
`source`, `medium`, `campaign`, `device`, `browser`, `os`, `country`, exact page
`path`, `converted=1`, `replay=1`. Date filtering selects sessions by start time;
all their events contribute to that session's metrics.

API keys cannot modify settings, manage users or issue new keys. The dashboard uses
cookie sessions for mutations with same-origin checks. Public collector endpoints
are intentionally separate from the reporting API.

## Recording constraints

Session recording is opt-in per counter and script. Snapshot chunks are gzipped;
duplicate chunk IDs are ignored. Inputs are masked before transport. Recordings
are not videos: rrweb reconstructs DOM and interactions in a sandboxed iframe.
Script execution is disabled by rrweb. Unavailable CSS/assets can change playback;
cross-origin frames, canvas and video are not recorded. A full snapshot is taken
every two minutes, with at most 10 MB of compressed recording per session.

The click map overlays normalized document coordinates onto a stored rrweb DOM snapshot. The snapshot is reconstructed in a script-disabled iframe; it is not a live fetch of the website. If no matching snapshot exists among the latest 25 recorded sessions, the coordinate grid remains available. Limit maps to a single page and device segment for useful comparisons. Raw click labels can reflect page text;
use privacy classes around sensitive content.

Weekly retention groups first-ever visitors by UTC Monday and shows their return in weeks 0–8. Future weeks are blank; incomplete weeks are not forecasts. Retention processes at most 100,000 matching visits; narrow the period on busy sites. Performance reports show arithmetic means of per-visit/page measurements, not P75 Core Web Vitals.
