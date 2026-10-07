// Runs supabase/schema.sql in PGlite (Postgres in WebAssembly) and checks what
// the public anon role can and can't do.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vitest'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const ANCHOR = JSON.stringify({ selector: 'body > main', strategy: 'path', tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 })

let db: PGlite

/** Runs a statement as the anon role, as the public API would. */
async function asAnon<T = Record<string, unknown>>(sql: string, params: unknown[] = []) {
  await db.exec('set role anon')
  try {
    return (await db.query<T>(sql, params)).rows
  } finally {
    await db.exec('reset role')
  }
}

async function addComment(opts: { project?: string; parent?: string | null; author?: string; body?: string } = {}) {
  const { project = 'demo', parent = null, author = 'Priya', body = 'Hello' } = opts
  const rows = await asAnon<{ id: string }>(
    `insert into public.comments (project, parent_id, route, author, body, anchor, viewport_width)
     values ($1, $2, '/', $3, $4, $5::jsonb, $6) returning id`,
    [project, parent, author, body, parent ? null : ANCHOR, parent ? null : 1280],
  )
  return rows[0].id
}

const resolvedAt = async (id: string) =>
  (await asAnon<{ resolved_at: string | null }>('select resolved_at from public.comments where id = $1', [id]))[0].resolved_at

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    grant usage on schema public to anon, authenticated;
  `)
  await db.exec(schema)
  // Re-running the setup script must be safe.
  await db.exec(schema)
})

describe('schema.sql', () => {
  it('stores the view on comments only, within a size limit', async () => {
    const view = JSON.stringify({ url: '/roster?week=2', steps: [JSON.parse(ANCHOR)] })
    const [{ id }] = await asAnon<{ id: string }>(
      `insert into public.comments (project, route, author, body, anchor, view)
       values ('demo', '/roster', 'Sam', 'Hi', $1::jsonb, $2::jsonb) returning id`, [ANCHOR, view])
    const [row] = await asAnon<{ view: unknown }>('select view from public.comments where id = $1', [id])
    expect(row.view).toEqual(JSON.parse(view))
    await expect(
      asAnon(`insert into public.comments (project, parent_id, route, author, body, view)
              values ('demo', $1, '/roster', 'Sam', 'Reply', $2::jsonb)`, [id, view]),
    ).rejects.toThrow(/comments_view_top_level/)
    await expect(
      asAnon(`insert into public.comments (project, route, author, body, anchor, view)
              values ('demo', '/', 'Sam', 'Hi', $1::jsonb, $2::jsonb)`, [ANCHOR, JSON.stringify({ url: 'x'.repeat(9000) })]),
    ).rejects.toThrow(/check constraint/)
  })

  it('lets anon add and read comments', async () => {
    const id = await addComment()
    const rows = await asAnon('select id, author, body, resolved_at from public.comments where id = $1', [id])
    expect(rows).toEqual([{ id, author: 'Priya', body: 'Hello', resolved_at: null }])
  })

  it('does not let anon choose an id, created_at or resolved_at', async () => {
    for (const [column, value] of [['id', 'gen_random_uuid()'], ['created_at', "now() - interval '1 year'"], ['resolved_at', 'now()']]) {
      await expect(
        asAnon(`insert into public.comments (${column}, project, route, author, body, anchor)
                values (${value}, 'demo', '/', 'Sam', 'Hi', $1::jsonb)`, [ANCHOR]),
      ).rejects.toThrow(/permission denied/)
    }
  })

  it('does not let anon update or delete directly', async () => {
    const id = await addComment()
    await expect(asAnon(`update public.comments set body = 'Changed' where id = $1`, [id])).rejects.toThrow(/permission denied/)
    await expect(asAnon('delete from public.comments where id = $1', [id])).rejects.toThrow(/permission denied/)
  })

  it('enforces length limits', async () => {
    await expect(addComment({ author: 'x'.repeat(61) })).rejects.toThrow(/check constraint/)
    await expect(addComment({ author: '   ' })).rejects.toThrow(/check constraint/)
    await expect(addComment({ body: 'x'.repeat(2001) })).rejects.toThrow(/check constraint/)
    await expect(addComment({ body: '' })).rejects.toThrow(/check constraint/)
    await expect(addComment({ author: 'x'.repeat(60), body: 'x'.repeat(2000) })).resolves.toBeTruthy()
  })

  it('requires an anchor on comments and none on replies', async () => {
    await expect(
      asAnon(`insert into public.comments (project, route, author, body) values ('demo', '/', 'Sam', 'No pin')`),
    ).rejects.toThrow(/comments_shape/)
    const parent = await addComment()
    await expect(
      asAnon(`insert into public.comments (project, parent_id, route, author, body, anchor)
              values ('demo', $1, '/', 'Sam', 'Pinned reply', $2::jsonb)`, [parent, ANCHOR]),
    ).rejects.toThrow(/comments_shape/)
  })

  it('allows only one level of replies, in the same project', async () => {
    const parent = await addComment()
    const reply = await addComment({ parent })
    await expect(addComment({ parent: reply })).rejects.toThrow(/top-level/)
    await expect(addComment({ parent, project: 'other' })).rejects.toThrow(/same project/)
  })

  it('lets anyone delete a comment, taking its replies with it', async () => {
    const parent = await addComment()
    const reply = await addComment({ parent })
    const other = await addComment({ parent })

    const [one] = await asAnon<{ ok: boolean }>('select public.delete_comment($1) as ok', [other])
    expect(one.ok).toBe(true)
    expect(await asAnon('select id from public.comments where id in ($1, $2)', [parent, reply])).toHaveLength(2)

    const [thread] = await asAnon<{ ok: boolean }>('select public.delete_comment($1) as ok', [parent])
    expect(thread.ok).toBe(true)
    expect(await asAnon('select id from public.comments where id in ($1, $2)', [parent, reply])).toEqual([])

    const [gone] = await asAnon<{ ok: boolean }>('select public.delete_comment($1) as ok', [parent])
    expect(gone.ok).toBe(false)
  })

  it('lets anyone resolve and reopen a thread, but not a reply', async () => {
    const parent = await addComment()
    const reply = await addComment({ parent })

    await asAnon('select public.set_resolved($1, true)', [parent])
    const first = await resolvedAt(parent)
    expect(first).not.toBeNull()
    // Resolving again keeps the original time.
    await asAnon('select public.set_resolved($1, true)', [parent])
    expect(await resolvedAt(parent)).toEqual(first)

    await asAnon('select public.set_resolved($1, false)', [parent])
    expect(await resolvedAt(parent)).toBeNull()

    const [onReply] = await asAnon<{ ok: boolean }>('select public.set_resolved($1, true) as ok', [reply])
    expect(onReply.ok).toBe(false)
    expect(await resolvedAt(reply)).toBeNull()
  })
})

describe('schema.sql upgrade', () => {
  it('upgrades a table from the first version, keeping comments', async () => {
    const old = new PGlite()
    await old.exec(`
      create role anon nologin;
      create role authenticated nologin;
      grant usage on schema public to anon, authenticated;
      create table public.comments (
        id uuid primary key default gen_random_uuid(), project text not null,
        parent_id uuid null references public.comments (id) on delete cascade,
        route text not null, author text not null, body text not null, anchor jsonb null,
        viewport_width int null, created_at timestamptz not null default now(),
        delete_token_hash text not null
      );
      create function public.delete_comment(comment_id uuid, token text) returns boolean language sql as 'select true';
    `)
    await old.query(`insert into public.comments (project, route, author, body, anchor, delete_token_hash) values ('demo', '/', 'Priya', 'Kept', $1::jsonb, 'x')`, [ANCHOR])
    await old.exec(schema)
    const rows = (await old.query<{ body: string; resolved_at: null }>('select body, resolved_at from public.comments')).rows
    expect(rows).toEqual([{ body: 'Kept', resolved_at: null }])
    const columns = (await old.query<{ column_name: string }>(`select column_name from information_schema.columns where table_name = 'comments'`)).rows
    expect(columns.map((c) => c.column_name)).not.toContain('delete_token_hash')
    const fns = (await old.query<{ args: string }>(`select pg_get_function_identity_arguments(oid) as args from pg_proc where proname = 'delete_comment'`)).rows
    expect(fns).toEqual([{ args: 'comment_id uuid' }])
  })
})
