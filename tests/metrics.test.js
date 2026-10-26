import test from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../server/db.js'
import { ingest } from '../server/ingest.js'
import { breakdown } from '../server/reports.js'
const setup = () => {
  const db = openDatabase(':memory:')
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'owner',
    'owner@example.test',
    'Owner',
    'hash',
    0,
  )
  db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
    'site_metric',
    'Site',
    '["example.test"]',
    'owner',
    0,
    0,
  )
  return { db, site: db.prepare('SELECT * FROM sites').get() }
}
test('entry page comes from first pageview and performance uses one sample per visit/page', (t) => {
  const { db, site } = setup()
  t.after(() => db.close())
  const events = [
    { id: 'metric_event_1', type: 'pageview', path: '/landing', ts: Date.now() },
    { id: 'metric_event_2', type: 'pageview', path: '/pricing', ts: Date.now() + 1 },
    {
      id: 'metric_event_3',
      type: 'performance',
      path: '/landing',
      props: { load_ms: 100 },
      ts: Date.now() + 2,
    },
    {
      id: 'metric_event_4',
      type: 'performance',
      path: '/landing',
      props: { load_ms: 100, lcp_ms: 250 },
      ts: Date.now() + 3,
    },
  ]
  ingest(
    db,
    site,
    { visitor: 'metric_visitor', session: 'metric_session', meta: { path: '/pricing' }, events },
    'Chrome',
  )
  assert.equal(db.prepare('SELECT entry FROM visits').get().entry, '/landing')
  const row = breakdown(db, site.id, { days: 1 }, 'performance')[0]
  assert.equal(row.samples, 1)
  assert.equal(row.load_ms, 100)
  assert.equal(row.lcp_ms, 250)
})
test('weekly retention uses first-ever visit and counts unique returning people', (t) => {
  const { db, site } = setup()
  t.after(() => db.close())
  for (const [sid, date] of [
    ['first_visit', '2026-10-05'],
    ['repeat_visit', '2026-10-13'],
    ['same_week_again', '2026-10-14'],
  ]) {
    const ts = Date.parse(date + 'T10:00:00Z')
    ingest(
      db,
      site,
      {
        visitor: 'one_person',
        session: sid,
        meta: { path: '/' },
        events: [{ id: 'event_' + sid, type: 'pageview', path: '/', ts }],
      },
      'Chrome',
      ts,
    )
  }
  const r = breakdown(db, site.id, { from: '2026-10-01', to: '2026-10-20' }, 'retention')
  assert.equal(r.length, 1)
  assert.equal(r[0].users, 1)
  assert.equal(r[0].w1, '100% (1)')
  assert.equal(r[0].w3, '—')
})
