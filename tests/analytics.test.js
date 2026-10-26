import test from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../server/db.js'
import { ingest } from '../server/ingest.js'
import {
  overview,
  behavior,
  breakdown,
  commerceReport,
  acquisitionReport,
  funnelReport,
} from '../server/reports.js'
import { period, dateKey } from '../server/core.js'

const day = Date.parse('2026-10-20T10:00:00Z'),
  q = { from: '2026-10-20', to: '2026-10-20' }
let serial = 0
function setup(t) {
  const db = openDatabase(':memory:')
  t.after(() => db.close())
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'owner',
    'owner@example.invalid',
    'Owner',
    'unused',
    0,
  )
  db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
    'test_site',
    'Site',
    '["example.invalid"]',
    'owner',
    0,
    0,
  )
  const site = db.prepare('SELECT * FROM sites').get()
  const add = (session, events, now = day, visitor = 'one_visitor', meta = {}) =>
    ingest(
      db,
      site,
      {
        visitor,
        session,
        meta: { path: '/', ...meta },
        events: events.map((e) => ({
          id: 'new_event_' + ++serial,
          type: 'pageview',
          path: '/',
          ts: now,
          ...e,
        })),
      },
      'Chrome',
      now,
    )
  return { db, site, add }
}
test('delayed and reordered packets preserve first and last pageview independently of heartbeat', (t) => {
  const { db, add } = setup(t)
  add('session_late', [
    { path: '/landing', ts: day - 600000 },
    { type: 'heartbeat', ts: day - 100000, props: { seconds: 10 } },
    { path: '/pricing', ts: day - 300000 },
  ])
  assert.deepEqual(
    { ...db.prepare('SELECT started,entry,exit FROM visits').get() },
    { started: day - 600000, entry: '/landing', exit: '/pricing' },
  )
  add('session_late', [
    { path: '/earlier', ts: day - 700000 },
    { path: '/last', ts: day - 50000 },
  ])
  assert.deepEqual(
    { ...db.prepare('SELECT started,entry,exit FROM visits').get() },
    { started: day - 700000, entry: '/earlier', exit: '/last' },
  )
})
test('page maps isolate event path, scroll counts unique visits, form completion uses intersection', (t) => {
  const { site, add, db } = setup(t)
  add('session_maps', [
    { path: '/pricing' },
    { path: '/about' },
    { type: 'click', path: '/pricing', props: { x: 2 } },
    { type: 'click', path: '/about', props: { x: 3 } },
    { type: 'scroll', path: '/pricing', props: { depth: 50 } },
    { type: 'scroll', path: '/about', props: { depth: 100 } },
    { type: 'form_start', props: { form: 'contact' } },
    { type: 'form_submit', props: { form: 'contact' } },
  ])
  add('session_submit', [{ type: 'form_submit', props: { form: 'contact' } }])
  const all = behavior(db, site.id, q),
    page = behavior(db, site.id, { ...q, path: '/pricing' })
  assert.equal(all.scroll[0].visits, 1)
  assert.equal(all.forms[0].conversion, 100)
  assert.equal(all.forms[0].untracked_starts, 1)
  assert.deepEqual(
    page.clicks.map((e) => e.path),
    ['/pricing'],
  )
  assert.deepEqual(
    behavior(db, site.id, { ...q, mapPath: '/about' }).clicks.map((e) => e.path),
    ['/about'],
  )
})
test('selected goal drives source conversion and converted segment without changing raw goals', (t) => {
  const { db, site, add } = setup(t)
  db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
    'pricing',
    site.id,
    'Pricing',
    'page',
    '/pricing',
  )
  db.prepare('INSERT INTO goals VALUES(?,?,?,?,?)').run(
    'lead',
    site.id,
    'Lead',
    'event',
    'lead_sent',
  )
  add('session_goal', [{ path: '/pricing' }])
  assert.equal(overview(db, site.id, { ...q, goal: 'lead' }).current.conversion_rate, 0)
  assert.equal(breakdown(db, site.id, { ...q, goal: 'lead' })[0].converted, 0)
  assert.equal(overview(db, site.id, { ...q, goal: 'lead', converted: '1' }).current.visits, 0)
  assert.equal(overview(db, site.id, { ...q, goal: 'pricing' }).current.conversion_rate, 100)
})
test('cross-session funnel preserves entry attribution and respects its time window', (t) => {
  const { db, site, add } = setup(t)
  const steps = JSON.stringify([
    { kind: 'page', value: '/' },
    { kind: 'event', value: 'lead_sent' },
  ])
  db.prepare('INSERT INTO funnels VALUES(?,?,?,?)').run('funnel', site.id, 'Funnel', steps)
  db.prepare('INSERT INTO funnel_settings VALUES(?,?,?)').run('funnel', 'visitor', 7)
  add('session_first', [{}], day, 'person_first', { utm_source: 'advert' })
  add('session_return', [{ type: 'event', name: 'lead_sent' }], day + 86400000, 'person_first')
  add('session_other', [{}], day, 'person_other', { utm_source: 'advert' })
  add(
    'session_too_late',
    [{ type: 'event', name: 'lead_sent' }],
    day + 8 * 86400000,
    'person_other',
  )
  const f = funnelReport(db, site.id, { ...q, source: 'advert' }, { id: 'funnel', steps })
  assert.equal(f.steps[0].count, 2)
  assert.equal(f.steps[1].count, 1)
  assert.equal(f.steps[0].dropoff, 1)
  assert.deepEqual(f.steps[0].dropoff_visits, ['session_other'])
  db.prepare("UPDATE funnel_settings SET scope='visit'").run()
  assert.equal(funnelReport(db, site.id, q, { id: 'funnel', steps }).steps[1].count, 0)
})
test('sales-day reports include midnight orders and distinguish unknown from explicit zero spend', (t) => {
  const { db, site, add } = setup(t)
  add('session_midnight', [{}], Date.parse('2026-10-20T23:59:00Z'))
  add(
    'session_midnight',
    [
      {
        type: 'ecommerce',
        props: { action: 'purchase', order_id: 'midnight', revenue: 500, currency: 'RUB' },
      },
    ],
    Date.parse('2026-10-21T00:01:00Z'),
  )
  const next = { from: '2026-10-21', to: '2026-10-21' }
  assert.equal(commerceReport(db, site.id, next).totals[0].revenue, 500)
  assert.equal(commerceReport(db, site.id, { ...next, dateBasis: 'visit' }).totals.length, 0)
  assert.equal(acquisitionReport(db, site.id, next)[0].cpa, null)
  db.prepare('INSERT INTO ad_costs VALUES(?,?,?,?,?,?)').run(
    site.id,
    '2026-10-21',
    'Прямые заходы',
    '',
    'RUB',
    0,
  )
  assert.equal(acquisitionReport(db, site.id, next)[0].cpa, 0)
})
test('calendar validation and account timezone handle Moscow midnight and DST days', () => {
  assert.throws(() => period({ from: '2026-02-30', to: '2026-03-05' }))
  assert.throws(() => period({ from: '2025-09-30', to: '2026-10-01' }))
  assert.doesNotThrow(() => period({ from: '2025-10-01', to: '2026-10-01' }))
  const m = period({ from: '2026-10-20', to: '2026-10-20', timezone: 'Europe/Moscow' })
  assert.equal(new Date(m.from).toISOString(), '2026-10-19T21:00:00.000Z')
  assert.equal(dateKey(m.from, 'Europe/Moscow'), '2026-10-20')
  const dst = period({ from: '2026-03-29', to: '2026-03-29', timezone: 'Europe/Berlin' })
  assert.equal(dst.to - dst.from + 1, 23 * 3600000)
})
test('timezone timeline groups midnight traffic by business day and comparison supports explicit dates', (t) => {
  const { site, db, add } = setup(t)
  add('session_moscow', [{}], Date.parse('2026-10-19T22:00:00Z'))
  const r = overview(db, site.id, {
    ...q,
    timezone: 'Europe/Moscow',
    compareFrom: '2026-10-18',
    compareTo: '2026-10-18',
  })
  assert.equal(r.current.visits, 1)
  assert.equal(r.timeline[0].day, '2026-10-20')
  assert.equal(r.timeline[0].visits, 1)
  assert.equal(r.previous.visits, 0)
})

test('AND/OR segments and event parameter matching cannot join values from separate events', (t) => {
  const { db, site, add } = setup(t)
  add(
    'session_param_a',
    [
      { type: 'event', name: 'signup', props: { plan: 'pro' } },
      { type: 'event', name: 'purchase', props: { plan: 'basic' } },
    ],
    day,
    'person_param_a',
    { utm_source: 'google' },
  )
  add(
    'session_param_b',
    [{ type: 'event', name: 'purchase', props: { plan: 'pro' } }],
    day,
    'person_param_b',
    { utm_source: 'telegram' },
  )
  const filter = (mode, rules) => ({ ...q, conditions: JSON.stringify({ mode, rules }) })
  const param = { field: 'event_param', key: 'plan', event: 'purchase', op: 'equals', value: 'pro' }
  assert.equal(overview(db, site.id, filter('all', [param])).current.visits, 1)
  assert.equal(
    overview(
      db,
      site.id,
      filter('all', [param, { field: 'source', op: 'equals', value: 'google' }]),
    ).current.visits,
    0,
  )
  assert.equal(
    overview(
      db,
      site.id,
      filter('any', [param, { field: 'source', op: 'equals', value: 'google' }]),
    ).current.visits,
    2,
  )
  assert.throws(() =>
    overview(
      db,
      site.id,
      filter('all', [{ field: 'invalid);DROP TABLE visits;', op: 'equals', value: 'x' }]),
    ),
  )
})

test('overlapping visitor funnel attempts retain later valid entry without reusing events', (t) => {
  const { db, site, add } = setup(t),
    steps = JSON.stringify([
      { kind: 'page', value: '/' },
      { kind: 'event', value: 'lead_sent' },
    ])
  db.prepare('INSERT INTO funnels VALUES(?,?,?,?)').run('overlap', site.id, 'Funnel', steps)
  db.prepare('INSERT INTO funnel_settings VALUES(?,?,?)').run('overlap', 'visitor', 7)
  add('session_old_entry', [{}], day - 3 * 86400000)
  add('session_new_entry', [{}], day)
  add('session_complete', [{ type: 'event', name: 'lead_sent' }], day + 5 * 86400000)
  const r = funnelReport(
    db,
    site.id,
    { from: '2026-10-17', to: '2026-10-24' },
    { id: 'overlap', steps },
  )
  assert.equal(r.steps[1].count, 1)
})
