import { afterEach, describe, expect, it, vi } from 'vitest'

// A stand-in for the Supabase client that records calls.
const calls: Array<{ op: string; args: unknown[] }> = []
let channelCallbacks: { on: Array<[unknown, () => void]>; status?: (s: string) => void } = { on: [] }
let rpcResult: { data: unknown; error: unknown } = { data: true, error: null }

const row = {
  id: 'c1', project: 'demo', parent_id: null, route: '/', author: 'Priya', body: 'Hi',
  anchor: { selector: 'main', strategy: 'path', tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 },
  viewport_width: 1280, created_at: '2026-10-07T00:00:00Z', resolved_at: null,
  view: { url: '/?tab=2', steps: [] },
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

  it('lists a project, asking for named columns only', async () => {
    const comments = await adapter().list('demo')
    expect(comments).toEqual([{
      id: 'c1', project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hi',
      anchor: row.anchor, viewportWidth: 1280, createdAt: '2026-10-07T00:00:00Z', resolvedAt: null,
      view: { url: '/?tab=2', steps: [] },
    }])
    const select = calls.find((c) => c.op === 'select')!.args[0] as string
    expect(select).toContain('resolved_at')
    expect(select).toContain('view')
    expect(select).not.toContain('*')
    expect(calls.find((c) => c.op === 'eq')!.args).toEqual(['project', 'demo'])
  })

  it('inserts only the columns clients may set', async () => {
    await adapter().create({
      project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hi',
      anchor: row.anchor as never, viewportWidth: 1280, view: row.view,
    })
    const inserted = calls.find((c) => c.op === 'insert')!.args[0] as Record<string, unknown>
    expect(Object.keys(inserted).sort()).toEqual(['anchor', 'author', 'body', 'parent_id', 'project', 'route', 'view', 'viewport_width'])
  })

  it('deletes and resolves through the RPCs, reporting errors', async () => {
    await adapter().remove('c1')
    await adapter().setResolved('c1', true)
    expect(calls.filter((c) => c.op === 'rpc').map((c) => c.args)).toEqual([
      ['delete_comment', { comment_id: 'c1' }],
      ['set_resolved', { comment_id: 'c1', resolved: true }],
    ])
    rpcResult = { data: null, error: new Error('offline') }
    await expect(adapter().remove('c1')).rejects.toThrow(/offline/)
  })

  it('batches realtime events into one reload and unsubscribes cleanly', async () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    const stop = adapter().subscribe!('demo', onChange)
    await vi.waitFor(() => expect(channelCallbacks.on).toHaveLength(3))
    expect(channelCallbacks.on[0][0]).toMatchObject({ event: 'INSERT', filter: 'project=eq.demo' })
    expect(channelCallbacks.on[1][0]).toMatchObject({ event: 'UPDATE', filter: 'project=eq.demo' })
    expect(channelCallbacks.on[2][0]).toMatchObject({ event: 'DELETE' })

    channelCallbacks.on[2][1]()
    channelCallbacks.on[2][1]()
    channelCallbacks.on[1][1]()
    channelCallbacks.on[0][1]()
    vi.advanceTimersByTime(150)
    expect(onChange).toHaveBeenCalledTimes(1)

    stop()
    expect(calls.some((c) => c.op === 'removeChannel')).toBe(true)
  })
})
