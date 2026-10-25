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

The comment toolbar shows on every page. The × at its end closes comments, leaving a small tab at the bottom of the page that brings them back. Open a page with `?feedback=0` to turn Corktack off completely for that browser tab, and `?feedback=1` to turn it back on. New comments from others since you last looked get a blue dot, and the list button shows how many; the list sorts unread first or by most recent. Leave out `adapter` to keep comments in your own browser only.

## Run a study

Take someone through tasks with the instructions shown at the top of the prototype. Add studies to `initFeedback`, then send them `?study=<id>`, or use the switch at the end of the toolbar. Comments are hidden while a study runs. If you switched in from the toolbar, the speech bubble in the study bar switches back; people who arrive by the study link stay in the study until they finish. The switch only shows when the prototype has studies.

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

A task finishes by itself when its goal is met: reaching `url`, or pressing the element with `data-feedback` set to `press`. Otherwise the participant presses Done to move on. A few seconds into each task the instructions tuck away to a small "1 of 3" tab at the top; clicking it brings them back. Progress survives reloads. `?study=off` ends a study.

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
