# OpenMetrika

**Self-hosted web analytics with session replay, goals and funnels.**

[Русская документация](README.ru.md) · [Tracker & API](docs/INTEGRATION.md) · [Security](SECURITY.md) · [Functional scope](docs/SCOPE.md)

OpenMetrika implements familiar web-analytics workflows using original code and an MIT
license. Track your own sites, inspect traffic and conversions, replay visits and keep
your data on your own server. It is an independent project, not a Yandex product.

Built by [Polza Agency](https://polzaagency.ru/?utm_source=openmetrika&utm_medium=github).
Need B2B customers to put into your funnel? That is what Polza does.

## Run locally

Requires **Node.js 24+**. No external database, Redis or SaaS account is needed.

```sh
npm ci
npm run build
npm start
```

Open **http://127.0.0.1:3015** and create the first administrator. Add a site, specify
its allowed domains and paste the generated tracker snippet into that site's HTML.
Data lives in `data/openmetrika.db`, which is ignored by Git.

For an isolated, editable demo with **fictional** traffic:

```sh
npm run demo
```

The demo runs on the same local port, uses a temporary database and removes it on
normal shutdown. Stop the regular server before starting it. `/fixture/` is a local
test website for verifying real tracking and masked session replay. It is only
served in demo mode. Demo login is automatic; never expose `DEMO_MODE=1` to the
internet without setting `DEMO_READ_ONLY=1` and access controls.

Development: `npm run dev` serves the UI on http://127.0.0.1:5180 and API on port 3015.
Run `node scripts/build-tracker.mjs` after changing tracker sources.

## Docker Compose

```sh
docker compose up --build -d
```

Compose binds to `127.0.0.1:3015`, uses named volumes, runs as a non-root user,
and drops Linux capabilities. Configure your own HTTPS reverse proxy for public
access and set `COOKIE_SECURE=1` and `PUBLIC_ORIGIN=https://your-analytics-domain`.
Create the first admin before opening public access. Do not expose the database.

## Features

- Multiple sites, owner/editor/viewer access, administrator setup, password login,
  expiring sessions, rate limits and site-scoped read-only API keys.
- First-party bundled tracker: pageviews, SPA navigation, UTM attribution, custom
  events, clicks, scroll depth, outbound links, downloads, form interactions,
  engagement heartbeats, performance samples and purchases.
- Dashboard, daily traffic, previous-period comparison, real-time visitor count,
  source/campaign/content/device/browser/OS reports, weekly retention, sortable tables and CSV export.
- Date ranges, segments, saved reports and an inspectable visit timeline.
- Event and page goals, unique converted sessions, ordered within-session funnels.
- Click overlays on saved DOM snapshots, coordinate distributions, link counts, scroll-depth distribution and form completion
  reports based on collected events.
- Session recording/playback with **rrweb**: input masking, private-element exclusion,
  inactive-time skipping, speed controls and independent recording retention.
- Ecommerce orders, currency-separated revenue and product totals. Ad cost entry/CSV
  import and source/campaign ROAS with no duplicate spend on repeated imports.
- SQLite WAL storage, retention cleanup, verified snapshots and safe restore.
- No external tracking services, fonts or CDN dependencies in the dashboard/tracker.

## Tracker

```html
<script defer src="https://analytics.example.com/om.js"
        data-site="YOUR_SITE_ID" data-replay="true"></script>
```

The dashboard generates the correct site ID. Recording requires **both** the
site recording option and `data-replay="true"`. Default tracker requests respect
Do Not Track and Global Privacy Control. Consent-gated mode is also supported.
Never put secrets or personal information into custom event parameters.

See [integration examples](docs/INTEGRATION.md) for consent, goals, purchases,
privacy classes, CSV ad costs and reporting API calls.

## Backup and restore

```sh
npm run backup -- create ./backups/snapshot
npm run backup -- verify ./backups/snapshot
# Stop the server, move the existing database + WAL/SHM aside, then:
npm run backup -- restore ./backups/snapshot
```

Backups include the database, events and recordings in a consistent SQLite
snapshot, a SHA-256 manifest and an integrity check. Restore refuses an occupied
destination. Keep copies outside the host; local volumes do not protect against
host loss. Backups contain analytics data and should remain private.

## Checks

```sh
npm test
npm run build
npm audit --omit=dev
```

CI also builds the Docker image and starts it to check health and first-run setup.

## Limits and semantics

This is a single-node analytics server intended for small and medium sites.
SQLite is convenient for self-hosting; it is not a distributed warehouse.
All report dates are UTC. Sessions expire after 30 minutes without activity;
engagement heartbeats count only visible, recently interacted-with pages. A bounce
is a session with fewer than two views, under 15 active seconds and no goal.
Conversion rate counts distinct sessions with at least one goal, not goal events.
Goals start collecting at creation; funnels can evaluate existing events.

No demographics, cross-site identity graph, unavailable search terms or automatic
Yandex Direct integration are fabricated. Country stays unknown without a GeoIP
source. Revenue currently comes from tracked ecommerce, not a CRM connector.
Cost attribution is exact source/campaign matching by visit; no cross-device model
is implied. Click maps can overlay a saved rrweb DOM snapshot; when no matching recording exists, a normalized coordinate grid is available.
Recordings of cross-origin frames, canvas, video and inaccessible assets are limited
by rrweb/browser capabilities. See [detailed limits](docs/INTEGRATION.md).

Visit lists show the latest 250 matching sessions; raw visit timelines show up to
5,000 events; behavior maps use up to 50,000 matching events; displayed order lists
are capped at 5,000 while revenue/product aggregates use the whole selected segment.

## License and dependencies

MIT. React, Express, rrweb and rrweb-player retain their own licenses. rrweb bundles
license notices into the built tracker. See [THIRD_PARTY_NOTICES](THIRD_PARTY_NOTICES.md).

Contributions: [CONTRIBUTING.md](CONTRIBUTING.md). Vulnerabilities: [SECURITY.md](SECURITY.md).
