import test from 'node:test'
import assert from 'node:assert/strict'
import { createApp } from '../server/index.js'
import { openDatabase } from '../server/db.js'
import { id, csv } from '../server/core.js'
import { demoRecording } from '../scripts/seed.mjs'

async function harness(t) {
  const db = openDatabase(':memory:'),
    { app } = createApp({ db }),
    server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(() => {
    server.close()
    db.close()
  })
  const origin = `http://127.0.0.1:${server.address().port}`
  let cookie = ''
  const req = async (path, method = 'GET', body, headers = {}) => {
    const r = await fetch(origin + path, {
      method,
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(method !== 'GET' ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: method !== 'GET' ? JSON.stringify(body || {}) : undefined,
    })
    if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0]
    return {
      status: r.status,
      data: r.headers.get('content-type')?.includes('json') ? await r.json() : await r.text(),
      headers: r.headers,
    }
  }
  await req('/api/setup', 'POST', {
    email: 'owner@example.test',
    name: 'Owner',
    password: 'long-safe-test-password',
  })
  const { data: site } = await req('/api/sites', 'POST', {
    name: 'Test site',
    domains: ['example.test'],
    replay: true,
  })
  return {
    db,
    site,
    req,
    origin,
    get cookie() {
      return cookie
    },
    setCookie: (value) => {
      cookie = value
    },
  }
}
const packet = (session, events, more = {}) => ({
  visitor: 'visitor_123456',
  session,
  meta: { path: '/', utm_source: 'newsletter', utm_medium: 'email' },
  events: events.map((e, i) => ({
    id: e.id || id(),
    ts: Date.now() + i,
    type: 'pageview',
    path: '/',
    ...e,
  })),
  ...more,
})

test('collection: allowlist, deduplication, private fields, reports and goals', async (t) => {
  const { site, req, db } = await harness(t),
    base = '/api/sites/' + site.id
  await req(base + '/goals', 'POST', { name: 'Lead', kind: 'event', value: 'lead_sent' })
  const data = packet('session_123456', [
    { id: 'event_123456', path: '/pricing?email=private@test' },
    {
      id: 'event_123457',
      type: 'event',
      name: 'lead_sent',
      props: { email: 'secret@example.test', token: 'secret', plan: 'pro' },
    },
    { id: 'event_123458', type: 'heartbeat', props: { seconds: 15 } },
  ])
  assert.equal(
    (await req('/collect/' + site.id, 'POST', data, { origin: 'https://evil.test' })).status,
    403,
  )
  const first = await req('/collect/' + site.id, 'POST', data, { origin: 'https://example.test' })
  assert.equal(first.status, 200)
  assert.equal(first.data.accepted, 3)
  assert.equal(
    (await req('/collect/' + site.id, 'POST', data, { origin: 'https://example.test' })).data
      .accepted,
    0,
  )
  assert.deepEqual(
    JSON.parse(db.prepare("SELECT props FROM events WHERE type='event'").get().props),
    { plan: 'pro' },
  )
  assert.equal(db.prepare("SELECT path FROM events WHERE type='pageview'").get().path, '/pricing')
  const report = (await req(base + '/overview?days=1')).data
  assert.equal(report.current.visits, 1)
  assert.equal(report.current.visitors, 1)
  assert.equal(report.current.pageviews, 1)
  assert.equal(report.current.conversion_rate, 100)
  assert.equal(report.current.bounce_rate, 0)
  assert.equal((await req(base + '/goals?days=1')).data[0].completions, 1)
  assert.equal((await req(base + '/reports/sources?days=1')).data[0].source, 'newsletter')
  assert.equal((await req(base + '/overview?source=other')).data.current.visits, 0)
  assert.equal((await req(base + '/overview?path=/pricing')).data.current.visits, 1)
  assert.equal((await req(base + '/overview?from=invalid')).status, 400)
})
test('ordered funnel counts sessions and does not count backwards steps', async (t) => {
  const { site, req } = await harness(t),
    base = '/api/sites/' + site.id,
    origin = { origin: 'https://example.test' }
  await req(base + '/funnels', 'POST', {
    name: 'Main',
    steps: [
      { kind: 'page', value: '/' },
      { kind: 'page', value: '/pricing' },
      { kind: 'event', value: 'lead' },
    ],
  })
  await req(
    '/collect/' + site.id,
    'POST',
    packet('session_correct', [
      { path: '/' },
      { path: '/pricing' },
      { type: 'event', name: 'lead' },
    ]),
    origin,
  )
  await req(
    '/collect/' + site.id,
    'POST',
    packet('session_reverse', [
      { path: '/pricing' },
      { path: '/' },
      { type: 'event', name: 'lead' },
    ]),
    origin,
  )
  assert.deepEqual(
    (await req(base + '/funnels')).data[0].steps.map((s) => s.count),
    [2, 1, 1],
  )
})
test('orders are idempotent, recordings are site scoped, deletion cascades', async (t) => {
  const { site, req, db } = await harness(t),
    base = '/api/sites/' + site.id,
    origin = { origin: 'https://example.test' },
    sid = 'session_recorded'
  const purchase = {
    type: 'ecommerce',
    props: {
      action: 'purchase',
      order_id: 'order-1',
      revenue: 500,
      currency: 'RUB',
      items: [{ id: 'sku', name: 'Item', price: 500, quantity: 1 }],
    },
  }
  await req('/collect/' + site.id, 'POST', packet(sid, [purchase, purchase]), origin)
  assert.equal((await req(base + '/ecommerce')).data.orders.length, 1)
  const replay = {
    session: sid,
    visitor: 'visitor_123456',
    chunk: 'chunk_123456',
    events: demoRecording(),
  }
  assert.equal((await req('/collect/' + site.id + '/replay', 'POST', replay, origin)).status, 200)
  await req('/collect/' + site.id + '/replay', 'POST', replay, origin)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM replay_chunks').get().n, 1)
  assert.equal((await req(base + '/visits/' + sid + '/replay')).data.length, 6)
  assert.equal(
    (
      await req(
        '/collect/' + site.id + '/replay',
        'POST',
        { ...replay, visitor: 'other_visitor' },
        origin,
      )
    ).status,
    400,
  )
  await req(base + '/visits/' + sid, 'DELETE')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM replay_chunks').get().n, 0)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0)
})
test('authentication, CSRF, viewer permissions and scoped API keys', async (t) => {
  const h = await harness(t),
    { site, req } = h,
    base = '/api/sites/' + site.id,
    ownerCookie = h.cookie
  assert.equal(
    (
      await req(
        base + '/goals',
        'POST',
        { name: 'Bad', kind: 'event', value: 'x' },
        { origin: 'https://evil.test' },
      )
    ).status,
    403,
  )
  await req(base + '/members', 'POST', {
    email: 'viewer@example.test',
    name: 'Viewer',
    password: 'viewer-test-long-password',
    role: 'viewer',
  })
  const key = (await req(base + '/keys', 'POST', { name: 'BI' })).data.token
  await req('/api/logout', 'POST', {})
  assert.equal((await req(base + '/overview')).status, 401)
  assert.equal(
    (await req(base + '/overview', 'GET', null, { authorization: 'Bearer ' + key })).status,
    200,
  )
  assert.equal(
    (await req(base + '/members', 'GET', null, { authorization: 'Bearer ' + key })).status,
    403,
  )
  await req('/api/login', 'POST', {
    email: 'viewer@example.test',
    password: 'viewer-test-long-password',
  })
  assert.equal((await req(base + '/overview')).status, 200)
  assert.equal(
    (await req(base + '/goals', 'POST', { name: 'No', kind: 'event', value: 'no' })).status,
    403,
  )
  const second = (await req('/api/sites', 'POST', { name: 'Own site', domains: ['other.test'] }))
    .data
  assert.equal(
    (
      await req('/api/sites/' + second.id + '/overview', 'GET', null, {
        authorization: 'Bearer ' + key,
      })
    ).status,
    404,
  )
  await req('/api/login', 'POST', {
    email: 'owner@example.test',
    password: 'long-safe-test-password',
  })
  assert.equal((await req('/api/sites/' + second.id + '/overview')).status, 404)
  assert.equal((await req('/api/setup', 'POST', {})).status, 409)
})
test('saved reports and behavior derive from actual events', async (t) => {
  const { site, req } = await harness(t),
    base = '/api/sites/' + site.id
  const events = [
    {
      type: 'click',
      props: { x: 50, y: 100, width: 100, height: 1000, selector: '#cta', link: '/pricing' },
    },
    { type: 'scroll', props: { depth: 80 } },
    { type: 'form_start', props: { form: 'lead' } },
    { type: 'form_submit', props: { form: 'lead' } },
  ]
  await req('/collect/' + site.id, 'POST', packet('session_behavior', events), {
    origin: 'https://example.test',
  })
  const behavior = (await req(base + '/behavior')).data
  assert.equal(behavior.clicks.length, 1)
  assert.equal(behavior.links[0].clicks, 1)
  assert.equal(behavior.scroll.find((s) => s.depth === 75).visits, 1)
  assert.equal(behavior.forms[0].conversion, 100)
  const saved = (
    await req(base + '/saved', 'POST', {
      name: 'Email',
      config: { filters: { source: 'newsletter' } },
    })
  ).data
  assert.equal((await req(base + '/saved')).data[0].name, 'Email')
  await req(base + '/saved/' + saved.id, 'DELETE')
  assert.equal((await req(base + '/saved')).data.length, 0)
})
test('CSV output neutralizes spreadsheet formulas', () => {
  const out = csv([{ name: '=HYPERLINK("https://evil")', n: 1 }])
  assert.ok(out.includes("'=HYPERLINK"))
  assert.ok(out.startsWith('\uFEFF'))
})

test('cost imports are idempotent and ROAS uses matching currencies and full totals', async (t) => {
  const { site, req } = await harness(t),
    base = '/api/sites/' + site.id,
    day = new Date().toISOString().slice(0, 10)
  await req(
    '/collect/' + site.id,
    'POST',
    packet('session_roi_test', [
      {
        type: 'ecommerce',
        props: {
          action: 'purchase',
          order_id: 'ROI-1',
          revenue: 600,
          currency: 'RUB',
          items: [{ id: 'one', name: 'Product', quantity: 2, price: 300 }],
        },
      },
    ]),
    { origin: 'https://example.test' },
  )
  const rows = [{ day, source: 'newsletter', campaign: '', currency: 'RUB', amount: 200 }]
  assert.equal((await req(base + '/costs', 'POST', { rows })).status, 200)
  await req(base + '/costs', 'POST', { rows })
  const roi = (await req(base + '/acquisition')).data[0]
  assert.equal(roi.cost, 200)
  assert.equal(roi.revenue, 600)
  assert.equal(roi.roas, 3)
  const commerce = (await req(base + '/ecommerce')).data
  assert.equal(commerce.totals[0].revenue, 600)
  assert.equal(commerce.products[0].quantity, 2)
  assert.equal((await req(base + '/acquisition?device=Смартфон')).status, 400)
})
