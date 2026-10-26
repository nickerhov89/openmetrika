import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../server/db.js'
import { backup, verify, restore } from '../scripts/backup.mjs'
test('live WAL snapshot restores consistently, refuses overwrite and detects corruption', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'om-backup-test-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const source = join(dir, 'source.db'),
    db = openDatabase(source)
  db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(
    'user',
    'test@example.test',
    'Test',
    'test-hash',
    Date.now(),
  )
  const folder = backup(source, join(dir, 'snapshot'))
  assert.equal(verify(folder).version, 1)
  const target = join(dir, 'restored.db')
  restore(folder, target)
  const restored = openDatabase(target)
  assert.equal(restored.prepare('SELECT name FROM users').get().name, 'Test')
  restored.close()
  assert.throws(() => restore(folder, target), /занят/)
  db.close()
  writeFileSync(join(folder, 'openmetrika.db'), 'damaged')
  assert.throws(() => verify(folder), /сумма/)
})
