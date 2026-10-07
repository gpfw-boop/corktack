import { defineConfig } from 'vite'
import { resolve } from 'node:path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'Corktack',
      fileName: 'corktack',
    },
    target: 'es2020',
    rollupOptions: {
      // Installed by the host app and only imported in feedback mode.
      external: ['@supabase/supabase-js'],
    },
  },
})
