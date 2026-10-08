# Corktack

Pinned comments for live web prototypes.

Setting up a prototype with an AI agent? Point it at [`docs/add-to-a-prototype.md`](docs/add-to-a-prototype.md).

## Install

```bash
npm install github:gpfw-boop/corktack
```

With Yarn (1 or later), use the full git URL so it builds on install:

```bash
yarn add corktack@git+https://github.com/gpfw-boop/corktack.git
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

A small tab peeks up from the bottom of the page. Hover it and click to turn comments on, and use the × in the toolbar to turn them off. Links with `?feedback=1` turn comments on straight away. To hide the tab on a prototype, pass `launcher: false`. Leave out `adapter` to keep comments in your own browser only.

## Run a study

Take someone through tasks with the instructions shown at the top of the prototype. Add studies to `initFeedback`, then send them `?study=<id>`. Comments stay off for the whole study.

```ts
initFeedback({
  project: 'my-prototype',
  studies: {
    onboarding: {
      title: 'Roster check',
      tasks: [
        {
          title: 'Find the roster for week 2',
          instructions: 'Find who’s working in week 2.',
          start: '/',
          goal: { url: '/roster?week=2' },
        },
        { title: 'Confirm today’s roster', goal: { press: 'confirm-roster' } },
      ],
    },
  },
})
```

A task finishes by itself when its goal is met: reaching `url`, or pressing the element with `data-feedback` set to `press`. Otherwise the participant presses Done, or I’m stuck to move on. Progress survives reloads. `?study=off` ends a study.

## Set up Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor. Run it again after updating Corktack; it upgrades the table and keeps your comments.
3. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`, and in your host's environment variables.

## Development

```bash
npm install
npm run dev
```

## Licence

MIT
