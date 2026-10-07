// Runs supabase/schema.sql in PGlite (Postgres in WebAssembly) and checks what
// the public anon role can and can't do.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { hashToken } from '../src/util'

const schema = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8')
const sha = (token: string) => createHash('sha256').update(token).digest('hex')
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

async function addComment(opts: { project?: string; parent?: string | null; token?: string; author?: string; body?: string } = {}) {
  const { project = 'demo', parent = null, token = 'token-a', author = 'Priya', body = 'Hello' } = opts
  const rows = await asAnon<{ id: string }>(
    `insert into public.comments (project, parent_id, route, author, body, anchor, viewport_width, delete_token_hash)
     values ($1, $2, '/', $3, $4, $5::jsonb, $6, $7) returning id`,
    [project, parent, author, body, parent ? null : ANCHOR, parent ? null : 1280, sha(token)],
  )
  return rows[0].id
}

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
  it('lets anon add and read comments, but not the token hash', async () => {
    const id = await addComment()
    const rows = await asAnon('select id, author, body from public.comments where id = $1', [id])
    expect(rows).toEqual([{ id, author: 'Priya', body: 'Hello' }])
    await expect(asAnon('select * from public.comments')).rejects.toThrow(/permission denied/)
    await expect(asAnon('select delete_token_hash from public.comments')).rejects.toThrow(/permission denied/)
  })

  it('does not let anon choose an id or created_at', async () => {
    await expect(
      asAnon(`insert into public.comments (id, project, route, author, body, anchor, delete_token_hash)
              values (gen_random_uuid(), 'demo', '/', 'Sam', 'Hi', $1::jsonb, $2)`, [ANCHOR, sha('x')]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      asAnon(`insert into public.comments (created_at, project, route, author, body, anchor, delete_token_hash)
              values (now() - interval '1 year', 'demo', '/', 'Sam', 'Hi', $1::jsonb, $2)`, [ANCHOR, sha('x')]),
    ).rejects.toThrow(/permission denied/)
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
      asAnon(`insert into public.comments (project, route, author, body, delete_token_hash) values ('demo', '/', 'Sam', 'No pin', $1)`, [sha('x')]),
    ).rejects.toThrow(/comments_shape/)
    const parent = await addComment()
    await expect(
      asAnon(`insert into public.comments (project, parent_id, route, author, body, anchor, delete_token_hash)
              values ('demo', $1, '/', 'Sam', 'Pinned reply', $2::jsonb, $3)`, [parent, ANCHOR, sha('x')]),
    ).rejects.toThrow(/comments_shape/)
  })

  it('allows only one level of replies, in the same project', async () => {
    const parent = await addComment()
    const reply = await addComment({ parent })
    await expect(addComment({ parent: reply })).rejects.toThrow(/top-level/)
    await expect(addComment({ parent, project: 'other' })).rejects.toThrow(/same project/)
  })

  it('deletes only with the matching token, taking replies with it', async () => {
    const parent = await addComment({ token: 'mine' })
    const reply = await addComment({ parent, token: 'someone-else' })

    const [wrong] = await asAnon<{ ok: boolean }>('select public.delete_comment($1, $2) as ok', [parent, 'not-mine'])
    expect(wrong.ok).toBe(false)

    const [right] = await asAnon<{ ok: boolean }>('select public.delete_comment($1, $2) as ok', [parent, 'mine'])
    expect(right.ok).toBe(true)

    const left = await asAnon('select id from public.comments where id in ($1, $2)', [parent, reply])
    expect(left).toEqual([])
  })

  it('hashes tokens the same way as the browser', async () => {
    const token = 'tökén-🙂-' + crypto.randomUUID()
    const [row] = (await db.query<{ hash: string }>(`select encode(sha256(convert_to($1, 'UTF8')), 'hex') as hash`, [token])).rows
    expect(row.hash).toBe(await hashToken(token))
  })
})
