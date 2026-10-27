import test from 'node:test'
import assert from 'node:assert/strict'
import { createAmo, amoHost } from '../server/amocrm.js'
import { openDatabase } from '../server/db.js'
import { createApp } from '../server/index.js'
import { hash } from '../server/core.js'

const time = Date.parse('2026-10-26T10:00:00Z')
const env = {
  AMO_CLIENT_ID: 'synthetic-client',
  AMO_CLIENT_SECRET: 'synthetic-secret',
  AMO_TOKEN_ENCRYPTION_KEY: 'ab'.repeat(32),
  AMO_REDIRECT_URI: 'https://analytics.example.invalid/api/amocrm/callback',
}
const baseConfig = {
  pipelines: [1],
  mapping: { '1:10': 'qualified', '1:11': 'meeting' },
  visitorField: 100,
  paymentField: 101,
  currency: 'RUB',
  automatic: true,
}
function fixture(t, options = {}) {
  const db = openDatabase(':memory:')
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'owner',
    'owner@example.invalid',
    'Owner',
    'unused',
    time,
  )
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'other',
    'other@example.invalid',
    'Other',
    'unused',
    time,
  )
  db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
    'site',
    'Site',
    '["example.invalid"]',
    'owner',
    0,
    time,
  )
  db.prepare('INSERT INTO sites VALUES(?,?,?,?,?,?)').run(
    'second',
    'Second',
    '["example.invalid"]',
    'owner',
    0,
    time,
  )
  let clock = time
  const calls = [],
    waits = [],
    state = { leads: [], tokenCount: 0, responder: null }
  const fetcher = async (url, init) => {
    calls.push({ url, init })
    assert.equal(init.redirect, 'error')
    assert.equal(new URL(url).hostname, 'fixture.amocrm.ru')
    if (state.responder) {
      const response = await state.responder(url, init)
      if (response) return response
    }
    if (url.endsWith('/oauth2/access_token')) {
      state.tokenCount++
      return Response.json({
        access_token: 'synthetic-access-' + state.tokenCount,
        refresh_token: 'synthetic-refresh-' + state.tokenCount,
        expires_in: 86400,
      })
    }
    if (url.includes('/leads/pipelines'))
      return Response.json({
        _embedded: {
          pipelines: [
            {
              id: 1,
              name: 'Sales',
              _embedded: {
                statuses: [
                  { id: 10, name: 'Qualified' },
                  { id: 142, name: 'Won' },
                ],
              },
            },
          ],
        },
      })
    if (url.includes('/custom_fields'))
      return Response.json({
        _embedded: {
          custom_fields: [
            { id: 100, name: 'ClientID', type: 'text' },
            { id: 101, name: 'Paid net', type: 'numeric' },
          ],
        },
      })
    return Response.json({ _embedded: { leads: state.leads } })
  }
  const amo = createAmo(db, {
    env,
    fetcher,
    now: () => clock,
    pause: async (ms) => {
      waits.push(ms)
    },
    ...options,
  })
  t.after(async () => {
    await amo.stop()
    db.close()
  })
  const authorize = async (site = 'site', user = 'owner', host = 'fixture.amocrm.ru') => {
    const state = new URL(amo.begin(site, user, host).url).searchParams.get('state')
    await amo.callback(user, { state, referer: host, code: 'synthetic-code' })
    return state
  }
  const lead = (more = {}) => ({
    id: 7,
    pipeline_id: 1,
    status_id: 10,
    created_at: Math.floor(time / 1000) - 3600,
    updated_at: Math.floor(clock / 1000),
    name: 'PRIVATE PERSON MUST NOT BE STORED',
    price: 900000,
    custom_fields_values: [
      { field_id: 100, values: [{ value: 'visitor_12345678' }] },
      { field_id: 101, values: [{ value: 1000 }] },
    ],
    ...more,
  })
  return {
    db,
    amo,
    state,
    calls,
    waits,
    authorize,
    lead,
    advance(ms) {
      clock += ms
    },
  }
}

test('amo OAuth rejects SSRF hosts, expires single-use state and binds it to owner and counter', async (t) => {
  const { amo, db, calls, authorize, advance } = fixture(t)
  for (const host of [
    'http://fixture.amocrm.ru',
    'fixture.amocrm.ru.evil.test',
    '127.0.0.1',
    'https://fixture.amocrm.ru:443',
    'a@fixture.amocrm.ru',
    'www.amocrm.ru',
    'fixture.amocrm.ru/?x=1',
  ])
    assert.throws(() => amoHost(host))
  assert.equal(amoHost('https://fixture.amocrm.ru/'), 'fixture.amocrm.ru')
  const state = new URL(amo.begin('site', 'owner', 'fixture.amocrm.ru').url).searchParams.get(
    'state',
  )
  assert.equal(db.prepare('SELECT hash FROM amo_states').get().hash, hash(state))
  await assert.rejects(
    amo.callback('other', { state, referer: 'fixture.amocrm.ru', code: 'code' }),
    /другому/,
  )
  assert.equal(calls.length, 0)
  await assert.rejects(
    amo.callback('owner', { state, referer: 'wrong.amocrm.ru', code: 'code' }),
    /другой аккаунт/,
  )
  assert.equal(calls.length, 0)
  const expired = new URL(amo.begin('site', 'owner', 'fixture.amocrm.ru').url).searchParams.get(
    'state',
  )
  advance(11 * 60000)
  await assert.rejects(amo.callback('owner', { state: expired }), /истёк/)
  const used = await authorize()
  await assert.rejects(
    amo.callback('owner', { state: used, referer: 'fixture.amocrm.ru', code: 'code' }),
    /истёк/,
  )
  assert.equal(amo.status('site').connected, true)
  const ciphertext = db.prepare('SELECT tokens FROM amo_connections').get().tokens
  assert.ok(!ciphertext.includes('synthetic'))
  assert.ok(!JSON.stringify(amo.status('site')).includes('synthetic'))
  // Ciphertext cannot be moved to another counter (GCM additional authenticated data).
  db.prepare('INSERT INTO amo_connections(site_id,host,tokens) VALUES(?,?,?)').run(
    'second',
    'fixture.amocrm.ru',
    ciphertext,
  )
  await assert.rejects(amo.catalog('second'), /расшифровать/)
})

test('amo import attributes ClientID and separates won deal budget from actual payments; repeats are idempotent', async (t) => {
  const { amo, db, state, authorize, lead } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  state.leads = [
    lead(),
    lead({ id: 8, status_id: 142, custom_fields_values: [] }),
    lead({ id: 9, pipeline_id: 2 }),
  ]
  await amo.sync('site')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_leads').get().n, 2)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM business_events WHERE stage='won'").get().n, 1)
  assert.equal(
    db.prepare("SELECT SUM(revenue) n FROM business_events WHERE stage='paid'").get().n,
    1000,
  )
  assert.equal(
    db.prepare("SELECT COUNT(*) n FROM business_leads WHERE visitor='visitor_12345678'").get().n,
    1,
  )
  assert.equal(amo.status('site').stats.matched, 1)
  const count = db.prepare('SELECT COUNT(*) n FROM business_events').get().n
  await amo.sync('site')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, count)
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM business_leads').all()).includes('PRIVATE'))
  assert.ok(
    !db
      .prepare('SELECT * FROM amo_leads')
      .all()
      .some((r) => JSON.stringify(r).includes('PRIVATE')),
  )
  await assert.rejects(amo.configure('site', { ...baseConfig, currency: 'USD' }), /менять нельзя/)
  await assert.rejects(amo.configure('site', { ...baseConfig, paymentField: 102 }), /менять нельзя/)
  amo.disconnect('site')
  assert.equal(db.prepare('SELECT tokens FROM amo_connections').get().tokens, '')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, count)
  await authorize()
  await amo.sync('site')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, count)
})

test('amo cumulative payments append deltas and refunds, ignore empty fields and roll back a bad lead atomically', async (t) => {
  const { amo, db, state, authorize, lead, advance } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  state.leads = [lead()]
  await amo.sync('site')
  advance(1000)
  state.leads = [
    lead({ custom_fields_values: [{ field_id: 101, values: [{ value: '1400.50' }] }] }),
  ]
  await amo.sync('site')
  advance(1000)
  state.leads = [lead({ custom_fields_values: [] })]
  await amo.sync('site')
  advance(1000)
  state.leads = [lead({ custom_fields_values: [{ field_id: 101, values: [{ value: 400 }] }] })]
  await amo.sync('site')
  const money = () =>
    db
      .prepare(
        "SELECT SUM(CASE WHEN stage='refund' THEN -revenue ELSE revenue END) total FROM business_events",
      )
      .get().total
  assert.equal(money(), 400)
  assert.equal(db.prepare("SELECT COUNT(*) n FROM business_events WHERE stage='paid'").get().n, 2)
  assert.equal(
    db.prepare("SELECT SUM(revenue) n FROM business_events WHERE stage='refund'").get().n,
    1000.5,
  )
  const cursor = db.prepare('SELECT cursor FROM amo_connections').get().cursor
  advance(1000)
  state.leads = [
    lead({
      id: 99,
      custom_fields_values: [{ field_id: 101, values: [{ value: 'not a number' }] }],
    }),
  ]
  await assert.rejects(amo.sync('site'), /копейки/)
  assert.equal(db.prepare('SELECT cursor FROM amo_connections').get().cursor, cursor)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_leads').get().n, 1)
  state.leads = [lead({ custom_fields_values: [{ field_id: 101, values: [{ value: 0 }] }] })]
  await amo.sync('site')
  assert.equal(money(), 0)
  // A transaction failure AFTER event insertion must roll back events and checkpoint together.
  advance(1000)
  db.exec(
    "CREATE TRIGGER fail_checkpoint BEFORE UPDATE ON amo_leads BEGIN SELECT RAISE(ABORT,'synthetic transaction failure'); END",
  )
  state.leads = [lead()]
  const count = db.prepare('SELECT COUNT(*) n FROM business_events').get().n
  await assert.rejects(amo.sync('site'), /transaction failure/)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM business_events').get().n, count)
  assert.equal(money(), 0)
  db.exec('DROP TRIGGER fail_checkpoint')
  await amo.sync('site')
  assert.equal(money(), 1000)
})

test('amo refresh rotation is serialized and a 401 retries once; 429 honors bounded retry and redacts errors', async (t) => {
  const { amo, state, calls, waits, authorize, advance } = fixture(t)
  await authorize()
  advance(86400000)
  const pending = amo.catalog('site')
  assert.throws(() => amo.catalog('site'), /Дождитесь/)
  await pending
  assert.equal(state.tokenCount, 2)
  const refresh = JSON.parse(
    calls.find((c) => c.init.body && JSON.parse(c.init.body).grant_type === 'refresh_token').init
      .body,
  )
  assert.equal(refresh.refresh_token, 'synthetic-refresh-1')
  let unauthorized = true,
    limited = true
  state.responder = async (url) => {
    if (url.includes('/leads/pipelines') && unauthorized) {
      unauthorized = false
      return new Response('PRIVATE PROVIDER ERROR', { status: 401 })
    }
    if (url.includes('/custom_fields') && limited) {
      limited = false
      return new Response('PRIVATE', { status: 429, headers: { 'retry-after': '999999' } })
    }
  }
  await amo.catalog('site')
  assert.equal(state.tokenCount, 3)
  assert.ok(waits.includes(30000))
  state.responder = async () => new Response('PRIVATE TOKEN AND PERSON', { status: 403 })
  await assert.rejects(
    amo.catalog('site'),
    (e) => e.message.includes('HTTP 403') && !e.message.includes('PRIVATE'),
  )
})

test('amo pagination uses safe local paths, preserves cursor on failure and resumes without double revenue', async (t) => {
  const { amo, db, state, authorize, lead } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  let fail = true
  state.responder = async (url) => {
    if (!url.includes('/api/v4/leads?')) return
    const page = new URL(url).searchParams.get('page')
    if (page === '1')
      return Response.json({
        _embedded: { leads: [lead()] },
        _links: { next: { href: 'http://127.0.0.1/private' } },
      })
    if (fail) return new Response('private', { status: 503 })
    return Response.json({ _embedded: { leads: [lead({ id: 8 })] } })
  }
  await assert.rejects(amo.sync('site'), /503/)
  assert.equal(db.prepare('SELECT cursor FROM amo_connections').get().cursor, 0)
  assert.equal(
    db.prepare("SELECT SUM(revenue) n FROM business_events WHERE stage='paid'").get().n,
    1000,
  )
  fail = false
  await amo.sync('site')
  assert.equal(
    db.prepare("SELECT SUM(revenue) n FROM business_events WHERE stage='paid'").get().n,
    2000,
  )
  await amo.sync('site')
  assert.equal(
    db.prepare("SELECT SUM(revenue) n FROM business_events WHERE stage='paid'").get().n,
    2000,
  )
  assert.equal(amo.status('site').error, '')
})

test('amo does not invent skipped milestones and ClientID can be filled later but never rebound', async (t) => {
  const { amo, db, state, authorize, lead, advance } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  state.leads = [lead({ status_id: 142, custom_fields_values: [] })]
  await amo.sync('site')
  assert.deepEqual(
    db
      .prepare('SELECT stage FROM business_events ORDER BY stage')
      .all()
      .map((r) => r.stage),
    ['lead', 'won'],
  )
  advance(1000)
  state.leads = [lead({ status_id: 142 })]
  await amo.sync('site')
  assert.equal(db.prepare('SELECT visitor FROM business_leads').get().visitor, 'visitor_12345678')
  advance(1000)
  state.leads = [
    lead({ custom_fields_values: [{ field_id: 100, values: [{ value: 'different_12345' }] }] }),
  ]
  await assert.rejects(amo.sync('site'), /ClientID сделки изменён/)
  assert.equal(db.prepare('SELECT visitor FROM business_leads').get().visitor, 'visitor_12345678')
})

test('amo API is owner-only, report keys cannot read config and demo/read-only cannot start OAuth', async (t) => {
  const { db } = fixture(t)
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(
    hash('owner-cookie'),
    'owner',
    Date.now() + 600000,
  )
  db.prepare('INSERT INTO auth_sessions VALUES(?,?,?)').run(
    hash('other-cookie'),
    'other',
    Date.now() + 600000,
  )
  db.prepare('INSERT INTO members VALUES(?,?,?)').run('site', 'other', 'editor')
  db.prepare('INSERT INTO api_keys VALUES(?,?,?,?,?)').run(
    'key',
    'site',
    hash('report-key'),
    'Report',
    time,
  )
  const servers = []
  t.after(() => {
    for (const s of servers) s.close()
  })
  async function boot(options = {}) {
    const { app } = createApp({
      db,
      amoOptions: {
        env,
        fetcher: () => {
          throw Error('No external calls expected')
        },
      },
      ...options,
    })
    const server = app.listen(0, '127.0.0.1')
    servers.push(server)
    await new Promise((r) => server.once('listening', r))
    return async (path, method = 'GET', body, extra = {}) => {
      const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
        method,
        headers: {
          cookie: 'om_session=owner-cookie',
          'content-type': 'application/json',
          ...extra,
        },
        ...(method !== 'GET' ? { body: JSON.stringify(body || {}) } : {}),
        redirect: 'manual',
      })
      return { status: res.status, data: await res.json() }
    }
  }
  const req = await boot(),
    path = '/api/sites/site/amocrm'
  assert.equal((await req(path)).data.configured, true)
  assert.equal((await req(path, 'GET', null, { cookie: 'om_session=other-cookie' })).status, 403)
  assert.equal(
    (await req(path, 'GET', null, { cookie: '', authorization: 'Bearer report-key' })).status,
    403,
  )
  assert.equal(
    (
      await req(
        path + '/connect',
        'POST',
        { host: 'fixture.amocrm.ru' },
        { origin: 'https://evil.invalid' },
      )
    ).status,
    403,
  )
  const readonly = await boot({ readOnly: true })
  assert.equal(
    (await readonly(path + '/connect', 'POST', { host: 'fixture.amocrm.ru' })).status,
    403,
  )
  assert.equal((await readonly('/api/amocrm/callback?state=x')).status, 403)
  const demo = await boot({ demo: true })
  assert.equal((await demo(path)).data.configured, false)
  assert.equal((await demo(path + '/connect', 'POST', { host: 'fixture.amocrm.ru' })).status, 403)
})

test('amo scheduler respects interval and opt-out; sorted incremental scans stop at the previous cursor', async (t) => {
  const { amo, state, calls, authorize, lead, advance } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  state.leads = [lead()]
  await amo.tick()
  assert.ok(amo.status('site').lastSync)
  const requests = calls.length
  await amo.tick()
  assert.equal(calls.length, requests)
  advance(16 * 60000)
  let pageCalls = 0
  state.responder = async (url) => {
    if (!url.includes('/api/v4/leads?')) return
    pageCalls++
    assert.equal(new URL(url).searchParams.get('page'), '1')
    return Response.json({
      _embedded: { leads: [lead(), lead({ id: 8, updated_at: Math.floor(time / 1000) - 200 })] },
      _links: { next: { href: 'https://untrusted.invalid/never-follow' } },
    })
  }
  await amo.tick()
  assert.equal(pageCalls, 1)
  await amo.configure('site', { ...baseConfig, automatic: false })
  advance(16 * 60000)
  await amo.tick()
  assert.equal(pageCalls, 1)
  await amo.stop()
  assert.throws(() => amo.sync('site'), /останавливается/)
})

test('amo partial-page failures already lock financial configuration and cancellation never calls token API', async (t) => {
  const { amo, state, authorize, lead, calls } = fixture(t)
  const denied = new URL(amo.begin('site', 'owner', 'fixture.amocrm.ru').url).searchParams.get(
    'state',
  )
  await assert.rejects(
    amo.callback('owner', { state: denied, error: 'access_denied' }),
    /не выдано/,
  )
  assert.equal(calls.length, 0)
  await authorize()
  await amo.configure('site', baseConfig)
  state.responder = async (url) => {
    if (!url.includes('/api/v4/leads?')) return
    if (new URL(url).searchParams.get('page') === '1')
      return Response.json({ _embedded: { leads: [lead()] }, _links: { next: {} } })
    return new Response('private', { status: 503 })
  }
  await assert.rejects(amo.sync('site'), /503/)
  assert.equal(amo.status('site').lastSync, 0)
  assert.equal(amo.status('site').financialLocked, true)
  await assert.rejects(amo.configure('site', { ...baseConfig, currency: 'USD' }), /менять нельзя/)
  amo.disconnect('site')
  assert.throws(() => amo.begin('site', 'owner', 'other.amocrm.ru'), /отдельный счётчик/)
})

test('amo rejects malformed successful responses without advancing cursor; empty 204 is valid', async (t) => {
  const { amo, state, authorize } = fixture(t)
  await authorize()
  await amo.configure('site', baseConfig)
  state.responder = async () => Response.json({ unexpected: 'not a lead list' })
  await assert.rejects(amo.sync('site'), /Некорректный список/)
  assert.equal(amo.status('site').lastSync, 0)
  state.responder = async () => new Response(null, { status: 204 })
  await amo.sync('site')
  assert.equal(amo.status('site').stats.leads, 0)
  assert.ok(amo.status('site').lastSync)
})
