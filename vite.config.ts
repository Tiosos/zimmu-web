import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // opencascade.js ships its WASM as a side-loaded asset and uses Emscripten's
  // UMD entry. Vite's pre-bundler can't handle either cleanly, so we exclude it
  // and let it resolve the .wasm URL through Vite's normal asset pipeline.
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
  },
})
