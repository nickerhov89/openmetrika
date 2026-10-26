import { defineConfig } from 'vite'
export default defineConfig({
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
