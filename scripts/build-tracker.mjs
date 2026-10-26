import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'
mkdirSync('public', { recursive: true })
await build({
  entryPoints: ['tracker/index.js'],
  outfile: 'public/om.js',
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2020'],
  legalComments: 'eof',
})
