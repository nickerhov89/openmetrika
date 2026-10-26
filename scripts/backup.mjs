import { DatabaseSync } from 'node:sqlite'
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  chmodSync,
} from 'node:fs'
import { resolve, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
const digest = (path) => createHash('sha256').update(readFileSync(path)).digest('hex')
export function verify(folder) {
  const manifest = JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8')),
    snapshot = join(folder, 'openmetrika.db')
  if (manifest.sha256 !== digest(snapshot)) throw Error('Контрольная сумма не совпадает')
  const db = new DatabaseSync(snapshot, { readOnly: true })
  try {
    const integrity = db.prepare('PRAGMA integrity_check').get()
    if (integrity.integrity_check !== 'ok') throw Error('SQLite integrity_check не прошёл')
  } finally {
    db.close()
  }
  return manifest
}
export function backup(source, folder) {
  if (!existsSync(source)) throw Error('Исходная база не найдена')
  if (existsSync(folder)) throw Error('Папка копии уже существует')
  mkdirSync(folder, { recursive: true, mode: 0o700 })
  const snapshot = join(folder, 'openmetrika.db'),
    db = new DatabaseSync(source)
  try {
    db.prepare('VACUUM INTO ?').run(resolve(snapshot))
  } finally {
    db.close()
  }
  chmodSync(snapshot, 0o600)
  writeFileSync(
    join(folder, 'manifest.json'),
    JSON.stringify(
      { version: 1, created_at: new Date().toISOString(), sha256: digest(snapshot) },
      null,
      2,
    ),
    { mode: 0o600 },
  )
  verify(folder)
  return folder
}
export function restore(folder, target) {
  verify(folder)
  if (existsSync(target) || existsSync(target + '-wal') || existsSync(target + '-shm'))
    throw Error('Путь базы уже занят. Остановите сервер и сохраните текущую базу отдельно')
  mkdirSync(dirname(resolve(target)), { recursive: true, mode: 0o700 })
  copyFileSync(join(folder, 'openmetrika.db'), target)
  chmodSync(target, 0o600)
  return target
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command = 'create', arg] = process.argv.slice(2),
    source = process.env.DATABASE_PATH || './data/openmetrika.db'
  try {
    if (command === 'create')
      console.log(
        'Копия:',
        backup(source, arg || `./backups/${new Date().toISOString().replaceAll(':', '-')}`),
      )
    else if (command === 'verify') {
      if (!arg) throw Error('Укажите папку копии')
      console.log(verify(arg))
    } else if (command === 'restore') {
      if (!arg) throw Error('Укажите папку копии')
      console.log('Восстановлено:', restore(arg, source))
    } else throw Error('Команды: create [папка], verify <папка>, restore <папка>')
  } catch (e) {
    console.error(e.message)
    process.exitCode = 1
  }
}
