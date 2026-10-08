# Add Corktack to a prototype

Instructions for an AI coding agent (or a person) adding Corktack to a web prototype. Corktack adds pinned comments and simple usability studies to a live prototype. Follow the steps in order, and ask the user when a step says to.

## 1. Install

Use the prototype's package manager. Check for a lockfile in the project root.

- `yarn.lock` (Yarn 1 or later):
  ```bash
  yarn add corktack@git+https://github.com/gpfw-boop/corktack.git
  ```
- `package-lock.json` (npm):
  ```bash
  npm install github:gpfw-boop/corktack
  ```

Use exactly these forms. With Yarn 1, the shorter `github:` form skips the build and installs a package with nothing in it.

## 2. Supabase settings

Comments are shared through Supabase. The prototype needs two environment variables:

```bash
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
```

- Ask the user for both values, or for another prototype's `.env.local` to copy them from. Several prototypes can share one Supabase project.
- Put them in `.env.local` in the project root. Check `.gitignore` covers it (`*.local` or `.env*`), and add `.env.local` if not. Never commit this file.
- The key must be the public anon or publishable key. Never use a secret or `service_role` key: anything in a `VITE_` variable ends up in the browser.
- If the user has no Supabase project yet, stop and point them to the "Set up Supabase" section of the README: https://github.com/gpfw-boop/corktack#set-up-supabase

These names assume Vite. For other build tools, use their equivalent for public, client-side variables.

## 3. Start Corktack

Call `initFeedback` once, where the app starts, after the app mounts. No framework plugin or wrapper is needed: Corktack adds itself to the page.

Vue, usually `src/main.ts`:

```ts
import { createApp } from 'vue'
import { initFeedback, supabaseAdapter } from 'corktack'
import App from './App.vue'
import router from './router'

createApp(App).use(router).mount('#app')

initFeedback({
  project: 'roster-prototype',
  adapter: supabaseAdapter({
    url: import.meta.env.VITE_SUPABASE_URL,
    anonKey: import.meta.env.VITE_SUPABASE_ANON_KEY,
  }),
})
```

React, usually `src/main.tsx`: the same call, after `createRoot(...).render(...)`.

Keep whatever the file already does; only add the import and the call.

- `project` keeps this prototype's comments apart from others in the same Supabase project. Use the prototype's name in lowercase with hyphens, and never reuse another prototype's name.
- With server-side rendering (Nuxt, Next and so on), call it only in the browser, such as in a client-only plugin or effect.
- Other options, all optional: `launcher: false` hides the "Add feedback" tab, `param` renames the `?feedback=1` switch, `hookAttribute` renames `data-feedback`, and `getRoute` changes how pages are grouped.

## 4. Add `data-feedback` hooks

Pins attach to elements. Corktack finds them again even after classes and Vue's scoped style hashes change, but a stable hook makes pins survive bigger redesigns:

```vue
<section data-feedback="roster-summary">…</section>
<button data-feedback="confirm-roster">Confirm roster</button>
```

- Add hooks to the main sections of each screen, and to any button or link a study task might end on.
- Values are lowercase with hyphens, describe what the element is, and are unique on the page.
- Don't add them to every element. Don't use generated values or values that change between builds.

## 5. Studies (only if the user asks for one)

A study takes a participant through tasks, with the instructions shown at the top of the prototype. Comments stay off during a study. Put studies in their own file and pass them in:

```ts
// src/studies.ts
import type { Study } from 'corktack'

export const studies: Record<string, Study> = {
  'roster-check': {
    title: 'Roster check',
    intro: 'Three short tasks. There are no wrong answers: we’re testing the design, not you.',
    tasks: [
      {
        title: 'Find the roster for week 2',
        instructions: 'You’ve heard week 2 looks different. Find who’s working that week.',
        start: '/',
        goal: { url: '/roster?week=2' },
      },
      {
        title: 'Confirm today’s roster',
        instructions: 'Everything looks right for today. Let the team know the roster is confirmed.',
        start: '/',
        goal: { press: 'confirm-roster' },
      },
    ],
  },
}
```

```ts
// src/main.ts
import { studies } from './studies'

initFeedback({ project: 'roster-prototype', adapter: supabaseAdapter({ … }), studies })
```

- The key (`roster-check`) is the id used in the link: `?study=roster-check`.
- `title` is short and plain. `instructions` describe the goal in the participant's words, without naming the buttons or links to use, because that gives the answer away.
- `start` is the address the task begins at. Leave it out to start wherever the participant is.
- `goal` finishes the task by itself. `{ url }` matches the path, plus the query and hash if given. `{ press }` matches a `data-feedback` value, so add that hook to the element. Without a goal, the participant presses Done when they've finished. Done is always there, so they can also use it to move on if they get stuck.
- Check every `goal.url` is a real route, and every `goal.press` exists on the page the task leads to.
- Write copy in the user's preferred language and spelling.

## 6. Check it works

Start the dev server and open the prototype.

- Hover the small tab at the bottom centre of the page and click "Add feedback". The toolbar appears. Press C, click something, write a comment and post it. Reload: the pin is still there.
- Opening the page with `?feedback=1` turns comments on directly, and the × in the toolbar turns them off.
- For a study, open `?study=<id>` and run through each task. Check each goal finishes its task. `?study=off` ends it.
- The browser console should show no `[corktack]` warnings. A warning about loading comments usually means the environment variables are missing; restart the dev server after editing `.env.local`.

## 7. Deploy

Tell the user to add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to their host's environment variables (on Vercel: Settings, then Environment Variables, for Production and Preview), then redeploy. Commit the lockfile so the host installs the same version of Corktack.

## Updating Corktack later

The lockfile pins the exact version, so installing again doesn't update it. Use:

- Yarn 2 or later: `yarn up "corktack@git+https://github.com/gpfw-boop/corktack.git"`
- Yarn 1: `yarn upgrade corktack`
- npm: `npm install github:gpfw-boop/corktack`

Then delete `node_modules/.vite` and restart the dev server.
