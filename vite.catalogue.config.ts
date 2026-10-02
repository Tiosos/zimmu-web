import { defineConfig } from 'vite'
export default defineConfig({
  build: {
    ssr: 'server/catalogue/main.ts', outDir: 'dist-catalogue',
    rolldownOptions: { output: { entryFileNames: 'server.js' } },
  },
})
