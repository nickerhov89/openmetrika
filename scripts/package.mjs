import { mkdtempSync, mkdirSync, cpSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
if (!existsSync('dist/index.html') || !existsSync('public/om.js'))
  throw Error('Сначала выполните npm run build')
const version = JSON.parse(readFileSync('package.json', 'utf8')).version
const output = resolve(process.argv[2] || `../../outputs/openmetrika/openmetrika-${version}.tar.gz`)
const temporary = mkdtempSync(join(tmpdir(), 'openmetrika-package-')),
  folder = join(temporary, 'openmetrika')
mkdirSync(folder)
try {
  const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter(Boolean)
  for (const file of files) {
    if (
      file.includes('..') ||
      file.startsWith('/') ||
      /^\.env$|(^|\/)(data|backups|node_modules)(\/|$)/.test(file)
    )
      throw Error('Небезопасный путь в релизе: ' + file)
    mkdirSync(dirname(join(folder, file)), { recursive: true })
    cpSync(file, join(folder, file))
  }
  cpSync('dist', join(folder, 'dist'), { recursive: true })
  mkdirSync(join(folder, 'public'), { recursive: true })
  cpSync('public/om.js', join(folder, 'public/om.js'))
  mkdirSync(dirname(output), { recursive: true })
  execFileSync('tar', ['-czf', output, '-C', temporary, 'openmetrika'])
  const sha = createHash('sha256').update(readFileSync(output)).digest('hex')
  writeFileSync(output + '.sha256', `${sha}  ${output.split('/').pop()}\n`)
  console.log(output)
  console.log('SHA-256:', sha)
} finally {
  rmSync(temporary, { recursive: true, force: true })
}
