import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { openDatabase } from '../server/db.js'
import { seedDemo } from './seed.mjs'
const directory = mkdtempSync(join(tmpdir(), 'openmetrika-demo-')),
  path = join(directory, 'demo.db')
const db = openDatabase(path)
seedDemo(db)
db.close()
const child = spawn(process.execPath, ['server/index.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    DATABASE_PATH: path,
    DEMO_MODE: '1',
    HOST: '127.0.0.1',
    PORT: process.env.DEMO_PORT || '3015',
  },
})
console.log('Демо использует вымышленные данные и временную базу. Тестовый сайт: /fixture/')
const cleanup = () => rmSync(directory, { recursive: true, force: true })
child.on('exit', (code) => {
  cleanup()
  process.exit(code || 0)
})
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
