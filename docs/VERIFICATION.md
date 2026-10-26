# Release verification

Date: 27 October 2026. Only synthetic traffic and `.invalid` contacts were used.

## Automated coverage

`npm test` covers collector domain restrictions, event retry deduplication, URL-path
sanitization, private event-property exclusion, goal/traffic calculations, segmentation,
ordered funnels, idempotent purchases, recording deduplication, recorded map snapshots,
cascading deletion, authentication, CSRF, site access, viewer permissions, scoped
read-only keys, saved reports, behavior aggregates, CSV formula escaping, ad cost
replacement, multi-currency totals, ROAS, CSV parsing, first-page attribution,
performance sample aggregation and weekly retention.

The backup test takes a snapshot from a live WAL database, verifies its checksum,
restores and queries it, rejects overwriting a database and detects corruption.

`npm run build` produces the first-party bundled counter and dashboard. Runtime npm
dependencies were checked with `npm audit --omit=dev`: no known vulnerabilities at
verification time. This is dependency/database/application testing, not an independent
penetration test or a claim of complete protection from all attacks.

GitHub CI performs clean install, tests, build, runtime dependency audit, Docker build,
container startup, healthcheck and initial setup check. See the repository Actions tab
for the result attached to the release commit.

## Browser verification

Opened the dashboard at mobile and desktop breakpoints. Verified summary navigation,
session list, actual recorded visit playback and clicks over a saved DOM snapshot.
Fixed an observed centering offset in the map renderer before release.

On the fixture website:

1. Opened with `utm_source=browser_test&utm_medium=qa&utm_campaign=release`.
2. Navigated through a History API SPA transition that removes query parameters.
3. Entered distinct synthetic marker values into company, email and textarea fields.
4. Submitted the test form and created a 5,000 RUB test purchase.
5. Inspected collector output through the authenticated demo reporting API.

Observed: source/campaign preserved; entry remained `/fixture/`; SPA pageview,
`lead_sent` and purchase collected; rrweb full snapshot present. None of the three
typed marker values appeared in recordings. The private `om-block` subtree was
absent, and rrweb metadata did not retain URL query strings.

## Release limitations

Single-node SQLite deployment; counter timezone reporting (UTC by default); no Yandex identity graph, demographic
data or Direct API credentials; GeoIP requires an additional source; ad costs are
manual/CSV; ecommerce and authenticated CRM outcome imports are supported. Vendor-specific
CRM authentication and webhook translation require configuration outside the tracker. Recorded snapshots and coordinate
normalization do not guarantee pixel identity across responsive layouts or changed
content. Counts/list caps and recording limits are documented in README and integration
instructions. Do not infer coverage of proprietary ecosystem features from a passing CI.

## v0.2 regression scope

The additional suites cover delayed/reordered packets, map isolation, scroll
denominators, form completion, selected goals, visitor funnels/window boundaries
and overlapping attempts, midnight sales, strict calendar dates, Moscow/DST
timezones, AND/OR and same-event parameter conditions, immutable CRM imports,
refund/margin arithmetic, identity binding, key isolation, viewer permissions,
private saved-report updates and lead-history erasure. See `tests/analytics.test.js`
and `tests/business.test.js`. Browser/load measurements for v0.2 are recorded
separately after building; passing unit tests alone does not establish UI coverage.

### Recorded v0.2 results (2026-10-27)

- 27/27 local tests passed; production build passed; runtime dependency audit
  found no known vulnerabilities at verification time.
- 28 report/settings endpoints returned HTTP 200 on the synthetic demo.
- Same 60-concurrent-read mix as the pre-change audit: P95 **4,358 ms**, compared
  with **23,218 ms** before; no failed requests. This is a local diagnostic probe,
  not a production capacity claim. The measured visitor funnel took 64 ms.
- Real browser: corrected page-report link, row-to-segment navigation, URL state,
  visual funnel creation/editing, attribution/window controls, business cohorts,
  a single-page scroll map and mobile menu navigation at a measured 390px width
  with no page-level horizontal overflow.
- Real fixture: 1 visit, 2 views, preserved UTM, original-path SPA click, confirmed
  synthetic lead and a 5,000 RUB ecommerce order. Typed marker values/private block
  stayed absent from the recording. Importing three synthetic CRM outcomes linked
  to that visitor produced 3,000 RUB revenue and 2,000 RUB gross profit under the
  correct source; absent marketing cost stayed unknown.
- [Machine-readable evidence](verification-v0.2.json) and [business UI](business.png).
