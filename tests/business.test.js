import test from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../server/db.js'
import { createApp } from '../server/index.js'
import { importBusiness, businessReport } from '../server/business.js'
import { ingest } from '../server/ingest.js'

const day = Date.parse('2026-10-20T10:00:00Z'),
  q = { from: '2026-10-20', to: '2026-10-20' }
async function setup(t) {
  const db = openDatabase(':memory:'),
    { app } = createApp({ db }),
    server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => {
    server.close()
    db.close()
  })
  const origin = 'http://127.0.0.1:' + server.address().port
  let cookie = ''
  const req = async (path, method = 'GET', body, headers = {}) => {
    const r = await fetch(origin + path, {
      method,
      headers: { cookie, 'content-type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : JSON.stringify(body || {}),
    })
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    return { status: r.status, data: await r.json() }
  }
  await req('/api/setup', 'POST', {
    email: 'owner@example.invalid',
    name: 'Owner',
    password: 'synthetic-test-password',
  })
  const site = (await req('/api/sites', 'POST', { name: 'Site', domains: ['example.invalid'] }))
    .data
  return { db, site, req }
}
const event = (id, stage, more = {}) => ({
  event_id: id,
  lead_id: 'crm-1',
  stage,
  ts: day,
  ...more,
})
test('sales imports are immutable, idempotent, atomic and scoped integration keys cannot read reports', async (t) => {
  const { req, site, db } = await setup(t),
    base = '/api/sites/' + site.id
  const key = (await req(base + '/integrations', 'POST', { name: 'CRM' })).data.token
  const auth = { authorization: 'Bearer ' + key, cookie: '' }
  assert.equal(
    (await req(base + '/business/import', 'POST', { events: [event('create', 'lead')] }, auth)).data
      .imported,
    1,
  )
  assert.equal(
    (await req(base + '/business/import', 'POST', { events: [event('create', 'lead')] }, auth)).data
      .duplicates,
    1,
  )
  assert.equal((await req(base + '/overview', 'GET', null, auth)).status, 403)
  assert.equal((await req(base + '/costs', 'POST', { rows: [] }, auth)).status, 403)
  const other = (await req('/api/sites', 'POST', { name: 'Other', domains: ['other.invalid'] }))
    .data.id
  assert.equal(
    (
      await req(
        '/api/sites/' + other + '/business/import',
        'POST',
        { events: [event('other', 'lead')] },
        auth,
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await req(
        base + '/business/import',
        'POST',
        { events: [event('new-valid', 'paid', { revenue: 500 }), event('create', 'paid')] },
        auth,
      )
    ).status,
    400,
  )
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, 1)
  const read = (await req(base + '/keys', 'POST', { name: 'BI' })).data.token
  assert.equal(
    (
      await req(
        base + '/business/import',
        'POST',
        { events: [event('blocked', 'lead')] },
        { authorization: 'Bearer ' + read },
      )
    ).status,
    401,
  )
})
test('paid outcomes, refunds, costs and quality metrics reconcile; missing costs remain unknown', async (t) => {
  const { db, site } = await setup(t)
  importBusiness(db, site.id, {
    events: [
      event('created', 'lead'),
      event('qualified', 'qualified'),
      event('meeting', 'meeting'),
      event('won', 'won'),
      event('payment', 'paid', { revenue: 1000, cost: 300, ts: day + 3600000 }),
      event('refund', 'refund', { revenue: 100, ts: day + 7200000 }),
    ],
  })
  let row = businessReport(db, site.id, q).rows[0]
  assert.equal(row.revenue, 900)
  assert.equal(row.gross_profit, 600)
  assert.equal(row.qualified, 1)
  assert.equal(row.meetings, 1)
  assert.equal(row.cac, null)
  db.prepare('INSERT INTO ad_costs VALUES(?,?,?,?,?,?)').run(
    site.id,
    '2026-10-20',
    'Не атрибутировано',
    '',
    'RUB',
    100,
  )
  row = businessReport(db, site.id, q).rows[0]
  assert.equal(row.contribution, 500)
  assert.equal(row.cpql, 100)
  assert.equal(row.romi, 500)
  assert.equal(businessReport(db, site.id, q).cohorts[0].customers, 1)
})
test('first versus last non-direct attribution joins previous visits, currencies cannot silently mix', async (t) => {
  const { db, site } = await setup(t)
  const add = (sid, source, ts) =>
    ingest(
      db,
      site,
      {
        visitor: 'known_visitor',
        session: sid,
        meta: source ? { utm_source: source, utm_campaign: 'test' } : {},
        events: [{ id: 'event_' + sid, type: 'pageview', path: '/', ts }],
      },
      'Chrome',
      ts,
    )
  add('visit_first', 'first-source', day - 3 * 86400000)
  add('visit_last', 'last-source', day - 86400000)
  add('visit_direct', '', day - 1000)
  importBusiness(db, site.id, {
    events: [
      event('known-lead', 'lead', { visitor: 'known_visitor' }),
      event('known-paid', 'paid', { revenue: 1000 }),
    ],
  })
  assert.equal(businessReport(db, site.id, q).rows[0].source, 'first-source')
  assert.equal(
    businessReport(db, site.id, { ...q, attribution: 'last' }).rows[0].source,
    'last-source',
  )
  assert.throws(() =>
    importBusiness(db, site.id, {
      events: [event('wrong-currency', 'paid', { currency: 'USD', revenue: 10 })],
    }),
  )
  assert.throws(() => businessReport(db, site.id, { ...q, device: 'Смартфон' }))
})
test('CRM identity cannot reference another site or change existing binding; cohort differs from financial period', async (t) => {
  const { db, site, req } = await setup(t)
  const other = (await req('/api/sites', 'POST', { name: 'Other', domains: ['other.invalid'] }))
    .data
  ingest(
    db,
    other,
    {
      visitor: 'private_visitor',
      session: 'other_session',
      meta: {},
      events: [{ id: 'other_event', type: 'pageview', path: '/', ts: day }],
    },
    'Chrome',
    day,
  )
  assert.throws(() =>
    importBusiness(db, site.id, {
      events: [event('bad-binding', 'lead', { session: 'other_session' })],
    }),
  )
  importBusiness(db, site.id, {
    events: [
      event('created', 'lead', { visitor: 'original_visitor' }),
      event('paid-tomorrow', 'paid', { revenue: 500, ts: day + 86400000 }),
    ],
  })
  assert.throws(() =>
    importBusiness(db, site.id, {
      events: [event('change-visitor', 'meeting', { visitor: 'another_visitor' })],
    }),
  )
  const tomorrow = { from: '2026-10-21', to: '2026-10-21' }
  assert.equal(businessReport(db, site.id, tomorrow).rows.length, 0)
  assert.equal(
    businessReport(db, site.id, { ...tomorrow, businessBasis: 'event' }).rows[0].revenue,
    500,
  )
})

test('primary goal settings persist, impossible costs and invalid funnels reject without partial records', async (t) => {
  const { db, site, req } = await setup(t),
    base = '/api/sites/' + site.id
  const pricing = (
    await req(base + '/goals', 'POST', { name: 'Pricing', kind: 'page', value: '/pricing' })
  ).data.id
  const lead = (
    await req(base + '/goals', 'POST', { name: 'Lead', kind: 'event', value: 'lead_sent' })
  ).data.id
  assert.equal(
    (
      await req(base, 'PATCH', {
        name: 'Site',
        domains: ['example.invalid'],
        primary_goal: lead,
        timezone: 'Europe/Moscow',
      })
    ).status,
    200,
  )
  await req(base, 'PATCH', { name: 'Renamed', domains: ['example.invalid'] })
  assert.equal((await req('/api/sites')).data[0].primary_goal, lead)
  assert.equal((await req('/api/sites')).data[0].timezone, 'Europe/Moscow')
  ingest(
    db,
    site,
    {
      visitor: 'test_visitor',
      session: 'test_session',
      meta: {},
      events: [{ id: 'pricing_event', type: 'pageview', path: '/pricing', ts: day }],
    },
    'Chrome',
    day,
  )
  assert.equal(
    (await req(base + '/overview?from=2026-10-20&to=2026-10-20')).data.current.conversion_rate,
    0,
  )
  assert.equal(
    (await req(base + '/overview?from=2026-10-20&to=2026-10-20&goal=' + pricing)).data.current
      .conversion_rate,
    100,
  )
  assert.equal(
    (
      await req(base + '/costs', 'POST', {
        rows: [{ day: '2026-02-30', source: 'ads', currency: 'RUB', amount: 100 }],
      })
    ).status,
    400,
  )
  assert.equal(
    (
      await req(base + '/funnels', 'POST', {
        name: 'Invalid',
        steps: [
          { kind: 'page', value: '/' },
          { kind: 'event', value: 'lead_sent' },
        ],
        window_days: 0,
      })
    ).status,
    400,
  )
  assert.equal(db.prepare('SELECT COUNT(*) n FROM funnels').get().n, 0)
})

test('viewers cannot import sales, saved report edits stay private and lead erasure cascades', async (t) => {
  const { db, site, req } = await setup(t),
    base = '/api/sites/' + site.id
  importBusiness(db, site.id, { events: [event('erase-event', 'lead')] })
  const saved = (
    await req(base + '/saved', 'POST', { name: 'Owner report', config: { view: 'overview' } })
  ).data.id
  await req(base + '/members', 'POST', {
    email: 'viewer@example.invalid',
    name: 'Viewer',
    password: 'synthetic-viewer-password',
    role: 'viewer',
  })
  await req('/api/logout', 'POST')
  await req('/api/login', 'POST', {
    email: 'viewer@example.invalid',
    password: 'synthetic-viewer-password',
  })
  assert.equal(
    (await req(base + '/business/import', 'POST', { events: [event('forbidden', 'paid')] })).status,
    403,
  )
  assert.equal((await req(base + '/business/leads/crm-1', 'DELETE')).status, 403)
  assert.equal(
    (await req(base + '/saved/' + saved, 'PATCH', { name: 'Overwrite', config: {} })).status,
    404,
  )
  const personal = (
    await req(base + '/saved', 'POST', { name: 'Personal', config: { view: 'overview' } })
  ).data.id
  assert.equal(
    (
      await req(base + '/saved/' + personal, 'PATCH', {
        name: 'Updated',
        config: { view: 'goals' },
      })
    ).status,
    200,
  )
  await req('/api/logout', 'POST')
  await req('/api/login', 'POST', {
    email: 'owner@example.invalid',
    password: 'synthetic-test-password',
  })
  assert.equal((await req(base + '/business/leads/crm-1', 'DELETE')).status, 200)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, 0)
})
