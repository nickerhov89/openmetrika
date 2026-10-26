import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db.js'
import { ingest } from '../server/ingest.js'

test('upgrade repairs historical visit bounds once without losing events', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'openmetrika-migration-')),
    path = join(directory, 'test.db')
  t.after(() => rmSync(directory, { recursive: true, force: true }))
  let db = openDatabase(path)
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
  const site = db.prepare('SELECT * FROM sites').get(),
    now = Date.now()
  ingest(
    db,
    site,
    {
      visitor: 'test_visitor',
      session: 'test_session',
      meta: {},
      events: [
        { id: 'first_event', type: 'pageview', path: '/first', ts: now - 10000 },
        { id: 'last_event', type: 'pageview', path: '/last', ts: now - 5000 },
      ],
    },
    'Chrome',
    now,
  )
  db.exec("DELETE FROM migrations;UPDATE visits SET started=ended,entry='/wrong',exit='/wrong'")
  db.close()
  db = openDatabase(path)
  const row = db.prepare('SELECT * FROM visits').get()
  assert.equal(row.started, now - 10000)
  assert.equal(row.entry, '/first')
  assert.equal(row.exit, '/last')
  assert.equal(db.prepare('SELECT COUNT(*) n FROM events').get().n, 2)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM migrations').get().n, 1)
  db.close()
  db = openDatabase(path)
  assert.equal(db.prepare('SELECT COUNT(*) n FROM migrations').get().n, 1)
  db.close()
})
