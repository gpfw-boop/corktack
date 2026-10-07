import { defineConfig } from 'vite'

// Serves the demo. Reads VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY from .env.local at the repo root.
export default defineConfig({
  root: __dirname,
  envDir: '..',
})
