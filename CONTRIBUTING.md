# Contributing

Use Node.js 24+. Run `npm ci`, `npm test`, `npm run build` before a pull request.
For development run `npm run dev`; build the tracker separately with
`node scripts/build-tracker.mjs`. For a fully populated local preview run
`npm run build && npm run demo`.

Keep changes scoped. Include a concrete before/after behavior and validation.
Use synthetic traffic and `.invalid` emails; never commit customer recordings,
production databases or secrets. Changes to reporting must test metric semantics,
idempotency and site isolation. Changes to recording must check input masking and
private-element exclusion using the fixture website.

Code is MIT; contributions are submitted under the same license. Preserve third
party license notices. Do not copy proprietary Yandex source, assets or branding.

Layout: `server/` (API/SQLite/reports), `tracker/` (bundled counter), `src/` (React),
`fixture/` (synthetic test website), `scripts/` (build/demo/backup), `tests/` (Node tests).
