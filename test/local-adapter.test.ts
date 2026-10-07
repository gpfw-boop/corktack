// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { localAdapter } from '../src/storage'
import type { NewComment } from '../src/types'

const anchor = { selector: 'main', strategy: 'path' as const, tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
const comment = (over: Partial<NewComment> = {}): NewComment => ({
  project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hello',
  anchor, viewportWidth: 1280, view: { url: '/?tab=2', steps: [] }, ...over,
})

beforeEach(() => localStorage.clear())

describe('localAdapter', () => {
  it('creates and lists comments per project', async () => {
    const db = localAdapter()
    const created = await db.create(comment())
    await db.create(comment({ project: 'other' }))
    expect(await db.list('demo')).toEqual([created])
    expect(created).toMatchObject({ project: 'demo', author: 'Priya', parentId: null, resolvedAt: null })
    expect(created.id).toBeTruthy()
  })

  it('reads comments saved by earlier versions', async () => {
    const { resolvedAt: _, view: __, ...old } = await localAdapter().create(comment())
    localStorage.setItem('corktack:comments:demo', JSON.stringify([old]))
    expect(await localAdapter().list('demo')).toEqual([{ ...old, resolvedAt: null, view: null }])
  })

  it('deletes a reply alone, or a comment with its replies', async () => {
    const db = localAdapter()
    const parent = await db.create(comment())
    const reply = await db.create(comment({ parentId: parent.id, anchor: null, viewportWidth: null, view: null }))
    await db.create(comment({ parentId: parent.id, anchor: null, viewportWidth: null, view: null }))
    await db.remove(reply.id)
    expect(await db.list('demo')).toHaveLength(2)
    await db.remove(parent.id)
    expect(await db.list('demo')).toEqual([])
  })

  it('resolves and reopens top-level comments only', async () => {
    const db = localAdapter()
    const parent = await db.create(comment())
    const reply = await db.create(comment({ parentId: parent.id, anchor: null, viewportWidth: null, view: null }))
    await db.setResolved(parent.id, true)
    await db.setResolved(reply.id, true)
    const [p, r] = await db.list('demo')
    expect(p.resolvedAt).toBeTruthy()
    expect(r.resolvedAt).toBeNull()
    await db.setResolved(parent.id, false)
    expect((await db.list('demo'))[0].resolvedAt).toBeNull()
  })

  it('tells other tabs when comments change', async () => {
    const db = localAdapter()
    let calls = 0
    const stop = db.subscribe!('demo', () => calls++)
    window.dispatchEvent(new StorageEvent('storage', { key: 'corktack:comments:demo' }))
    window.dispatchEvent(new StorageEvent('storage', { key: 'corktack:comments:other' }))
    stop()
    window.dispatchEvent(new StorageEvent('storage', { key: 'corktack:comments:demo' }))
    expect(calls).toBe(1)
  })
})
