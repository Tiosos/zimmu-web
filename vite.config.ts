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
      // Set ANALYZE=1 to auto-open after build, otherwise just written to dist/
      open: !!process.env.ANALYZE,
      gzipSize: true,
    }),
  ],
  // opencascade.js ships its WASM as a side-loaded asset and uses Emscripten's
  // UMD entry. Vite's pre-bundler can't handle either cleanly, so we exclude it
  // and let it resolve the .wasm URL through Vite's normal asset pipeline.
  // (vite-plugin-wasm handles future direct `import ... from '*.wasm'` calls.)
  optimizeDeps: {
    exclude: ['opencascade.js'],
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
    plugins: () => [wasm()],
  },
  server: {
    fs: {
      allow: ['..'],
    },
    // Permit dockerized browsers (Playwright via MCP) to hit the dev server.
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
