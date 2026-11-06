import { defineConfig } from 'vite'
const base = process.env.OPENMETRIKA_BASE_PATH || '/'
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base))
  throw Error('OPENMETRIKA_BASE_PATH must be / or /prefix/')
export default defineConfig({
  base,
  server: {
    port: 5180,
    strictPort: true,
    proxy: {
      '/api': 'http://127.0.0.1:3015',
      '/om.js': 'http://127.0.0.1:3015',
      '/collect': 'http://127.0.0.1:3015',
      '/fixture': 'http://127.0.0.1:3015',
    },
  },
  build: { outDir: 'dist' },
})
