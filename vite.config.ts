import { readFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import checker from 'vite-plugin-checker'
import { visualizer } from 'rollup-plugin-visualizer'
import tailwindcss from '@tailwindcss/vite'

const { version } = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf-8'),
) as { version: string }

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    checker({ typescript: true }),
    visualizer({
      filename: 'dist/stats.html',
      // Set ANALYZE=1 to auto-open after build, otherwise just written to dist/
      open: !!process.env.ANALYZE,
      gzipSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  // opencascade.js ships its WASM as a side-loaded asset and uses Emscripten's
  // UMD entry. Its `index.js` does `import wasmFile from './...wasm'` and feeds
  // that to Emscripten's locateFile, so the import MUST resolve to the asset
  // URL. `assetsInclude` makes Vite treat .wasm as a URL asset. We deliberately
  // do NOT use vite-plugin-wasm: it ESM-instantiates .wasm (no default URL
  // export), which breaks opencascade's URL import in both dev and build.
  // opencascade.js is also excluded from the pre-bundler (the 65MB module must
  // not be optimized).
  optimizeDeps: {
    exclude: ['opencascade.js'],
  },
  assetsInclude: ['**/*.wasm'],
  worker: {
    format: 'es',
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
    exclude: [...configDefaults.exclude, 'e2e/**/*.spec.ts'],
  },
})
