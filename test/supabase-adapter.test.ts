import { afterEach, describe, expect, it, vi } from 'vitest'
import { hashToken } from '../src/util'

// A stand-in for the Supabase client that records calls.
const calls: Array<{ op: string; args: unknown[] }> = []
let channelCallbacks: { on: Array<[unknown, () => void]>; status?: (s: string) => void } = { on: [] }
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }

const row = {
  id: 'c1', project: 'demo', parent_id: null, route: '/', author: 'Priya', body: 'Hi',
  anchor: { selector: 'main', strategy: 'path', tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 },
  viewport_width: 1280, created_at: '2026-10-07T00:00:00Z',
}

function query(): any {
  const q: any = {
    select: (...args: unknown[]) => (calls.push({ op: 'select', args }), q),
    eq: (...args: unknown[]) => (calls.push({ op: 'eq', args }), q),
    order: (...args: unknown[]) => (calls.push({ op: 'order', args }), Promise.resolve({ data: [row], error: null })),
    insert: (...args: unknown[]) => (calls.push({ op: 'insert', args }), q),
    single: () => Promise.resolve({ data: row, error: null }),
  }
  return q
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => {
    calls.push({ op: 'createClient', args })
    return {
      from: (table: string) => (calls.push({ op: 'from', args: [table] }), query()),
      rpc: (...args: unknown[]) => (calls.push({ op: 'rpc', args }), Promise.resolve(rpcResult)),
      channel: (name: string) => {
        calls.push({ op: 'channel', args: [name] })
        const ch: any = {
          on: (_type: string, filter: unknown, cb: () => void) => (channelCallbacks.on.push([filter, cb]), ch),
          subscribe: (cb: (s: string) => void) => ((channelCallbacks.status = cb), ch),
        }
        return ch
      },
      removeChannel: () => calls.push({ op: 'removeChannel', args: [] }),
    }
  },
}))

const { supabaseAdapter } = await import('../src/supabase')
const adapter = () => supabaseAdapter({ url: 'https://example.supabase.co', anonKey: 'anon' })

afterEach(() => {
  calls.length = 0
  channelCallbacks = { on: [] }
  rpcResult = { data: true, error: null }
  vi.useRealTimers()
})

describe('supabaseAdapter', () => {
  it('does not load the client until it is used', async () => {
    adapter()
    expect(calls.find((c) => c.op === 'createClient')).toBeUndefined()
  })

  it('lists a project without asking for the token hash', async () => {
    const comments = await adapter().list('demo')
    expect(comments).toEqual([{
      id: 'c1', project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hi',
      anchor: row.anchor, viewportWidth: 1280, createdAt: '2026-10-07T00:00:00Z',
    }])
    const select = calls.find((c) => c.op === 'select')!.args[0] as string
    expect(select).not.toContain('delete_token_hash')
    expect(select).not.toContain('*')
    expect(calls.find((c) => c.op === 'eq')!.args).toEqual(['project', 'demo'])
  })

  it('sends a hash of the delete token, never the token', async () => {
    await adapter().create({
      project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hi',
      anchor: row.anchor as never, viewportWidth: 1280, deleteToken: 'secret-token',
    })
    const inserted = calls.find((c) => c.op === 'insert')!.args[0] as Record<string, unknown>
    expect(inserted.delete_token_hash).toBe(await hashToken('secret-token'))
    expect(JSON.stringify(inserted)).not.toContain('secret-token')
  })

  it('deletes through the RPC and reports a refused delete', async () => {
    await adapter().remove('c1', 'tok')
    expect(calls.find((c) => c.op === 'rpc')!.args).toEqual(['delete_comment', { comment_id: 'c1', token: 'tok' }])
    rpcResult = { data: false, error: null }
    await expect(adapter().remove('c1', 'tok')).rejects.toThrow(/own comments/)
  })

  it('batches realtime events into one reload and unsubscribes cleanly', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const stop = adapter().subscribe!('demo', onChange)
    await vi.waitFor(() => expect(channelCallbacks.on).toHaveLength(2))
    expect(channelCallbacks.on[0][0]).toMatchObject({ event: 'INSERT', filter: 'project=eq.demo' })
    expect(channelCallbacks.on[1][0]).toMatchObject({ event: 'DELETE' })

    channelCallbacks.on[1][1]()
    channelCallbacks.on[1][1]()
    channelCallbacks.on[0][1]()
    vi.advanceTimersByTime(150)
    expect(onChange).toHaveBeenCalledTimes(1)

    stop()
    expect(calls.some((c) => c.op === 'removeChannel')).toBe(true)
  })
})
