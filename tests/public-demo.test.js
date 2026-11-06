import test from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../server/db.js'
import { createApp } from '../server/index.js'
import { seedDemo } from '../scripts/seed.mjs'

test('public demo auto-login reads seeded reports but all browser and collector writes are blocked', async (t) => {
  const db = openDatabase(':memory:')
  seedDemo(db)
  const { app, amo } = createApp({ db, demo: true, readOnly: true })
  const server = app.listen(0, '127.0.0.1')
  await new Promise((r) => server.once('listening', r))
  t.after(async () => {
    server.close()
    await amo.stop()
    db.close()
  })
  const origin = 'http://127.0.0.1:' + server.address().port
  const response = await fetch(origin + '/api/me')
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow')
  const me = await response.json()
  assert.equal(me.demo, true)
  assert.equal(me.readOnly, true)
  assert.equal(me.setup, false)
  const sites = await (await fetch(origin + '/api/sites')).json()
  assert.equal(sites[0].id, 'demo_openmetrika')
  assert.equal((await fetch(origin + '/api/sites/demo_openmetrika/business?days=30')).status, 200)
  for (const [path, method] of [
    ['/api/setup', 'POST'],
    ['/api/sites/demo_openmetrika', 'PATCH'],
    ['/api/sites/demo_openmetrika/business/leads/x', 'DELETE'],
    ['/collect/demo_openmetrika', 'POST'],
    ['/collect/demo_openmetrika/replay', 'POST'],
  ]) {
    assert.equal(
      (
        await fetch(origin + path, {
          method,
          headers: { 'content-type': 'application/json', origin: 'http://localhost:3015' },
          body: '{}',
        })
      ).status,
      403,
    )
  }
  assert.equal((await fetch(origin + '/api/amocrm/callback?state=invalid')).status, 403)
  assert.equal((await fetch(origin + '/api/sites/demo_openmetrika/amocrm')).status, 200)
  assert.equal(amo.status('demo_openmetrika').configured, false)
})
