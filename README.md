# Corktack

Pinned comments for live web prototypes.

## Install

```bash
npm install github:gpfw-boop/corktack
```

## Use

Add one call where your app starts, for example `src/main.ts`:

```ts
import { initFeedback, supabaseAdapter } from 'corktack'

initFeedback({
  project: 'my-prototype',
  adapter: supabaseAdapter({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }),
})
```

Open the page with `?feedback=1` to turn comments on, and `?feedback=off` to turn them off. Leave out `adapter` to keep comments in your own browser only.

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, and in your host's environment variables.

## Development

```bash
npm install
npm run dev
```

## Licence

MIT
