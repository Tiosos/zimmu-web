import { readFileSync } from 'node:fs'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import checker from 'vite-plugin-checker'
import { visualizer } from 'rollup-plugin-visualizer'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig({
  plugins: [
    wasm(),
    react(),
    checker({ typescript: true }),
    visualizer({
      filename: 'dist/stats.html',
      open: !!process.env.ANALYZE,
      gzipSize: true,
    }),
  ],
  optimizeDeps: { exclude: ['opencascade.js'] },
  assetsInclude: ['**/*.wasm'],
  worker: { format: 'es', plugins: () => [wasm()] },
  server: {
    fs: { allow: ['..'] },
    allowedHosts: ['localhost', '127.0.0.1', 'host.docker.internal'],
  },
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(version),
  },
  test: {
    environment: 'happy-dom',
    setupFiles: ['./vitest.setup.ts'],
  },
})
