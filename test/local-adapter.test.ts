// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { localAdapter } from '../src/storage'
import type { NewComment } from '../src/types'

const anchor = { selector: 'main', strategy: 'path' as const, tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
const comment = (over: Partial<NewComment> = {}): NewComment => ({
  project: 'demo', parentId: null, route: '/', author: 'Priya', body: 'Hello',
  anchor, viewportWidth: 1280, deleteToken: 'mine', ...over,
})

beforeEach(() => localStorage.clear())

describe('localAdapter', () => {
  it('creates and lists comments per project, without exposing the token or its hash', async () => {
    const db = localAdapter()
    const created = await db.create(comment())
    await db.create(comment({ project: 'other' }))
    const list = await db.list('demo')
    expect(list).toEqual([created])
    expect(created).toMatchObject({ project: 'demo', author: 'Priya', parentId: null })
    expect(created.id).toBeTruthy()
    expect(JSON.stringify(list)).not.toMatch(/mine|deleteToken/)
  })

  it('deletes only with the right token, taking replies with it', async () => {
    const db = localAdapter()
    const parent = await db.create(comment())
    await db.create(comment({ parentId: parent.id, anchor: null, viewportWidth: null, deleteToken: 'theirs' }))
    await expect(db.remove(parent.id, 'theirs')).rejects.toThrow(/own comments/)
    expect(await db.list('demo')).toHaveLength(2)
    await db.remove(parent.id, 'mine')
    expect(await db.list('demo')).toEqual([])
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
