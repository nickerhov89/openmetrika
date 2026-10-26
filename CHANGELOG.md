# Changes

## 0.2.0 — 2026-10-27

- Repair delayed/reordered visit timestamps and entry/exit pages, including a
  one-time transactional migration for existing databases.
- Index conversion lookups; optimize cross-session funnel queries.
- Isolate map pages, count scroll visits once and calculate form conversion from
  matched starts/submits; expose submissions without a tracked start.
- Add primary/selected goals, strict dates, IANA account timezones, explicit
  comparison periods, AND/OR/event-property segments and report drill-down.
- Add editable visual funnels across visits with configurable windows, overlapping
  attempts, step losses and links to sample drop-off visits.
- Add CRM outcome imports, write-only site-scoped keys, refunds/direct costs,
  business cohorts, channel economics, CSV and first/last non-direct attribution.
- Distinguish unknown advertising spend from zero; ecommerce defaults to order
  dates with a visit-date option.
- Fix dashboard report links and SPA click paths. Add report URLs, saved-report
  editing, server-side visit search, connection diagnostics, heuristic conversion
  signals and accessible compact-screen navigation.

## 0.1.0

Initial self-hosted analytics release, tracker, rrweb recording, goals, reports,
ecommerce, cost imports, scoped read API, backups and Docker distribution.
