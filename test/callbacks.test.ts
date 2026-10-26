// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { initFeedback, localAdapter } from '../src/index'
import type { FeedbackComment } from '../src/types'

beforeAll(() => {
  // jsdom has no matchMedia or CSS.escape.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener() {}, removeEventListener() {} })) as never
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (v: string) => v.replace(/[^\w-]/g, '\\$&') }
})

const anchor = { selector: 'main', strategy: 'path' as const, tag: 'main', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
const seed = (id: string, author: string): FeedbackComment => ({
  id, project: 'demo', parentId: null, route: '/', author, body: `From ${author}`, anchor,
  viewportWidth: 1280, createdAt: new Date().toISOString(), resolvedAt: null, view: null, context: null,
})

type Overlay = HTMLElement & { updateComplete: Promise<unknown>; card: unknown }
const overlay = () => document.querySelector('corktack-overlay') as Overlay | null
/** Sets the open card the way a pin, the list or a link would, then waits for it to render. */
const openCard = async (card: unknown) => {
  overlay()!.card = card
  await overlay()!.updateComplete
}

let stop: (() => void) | undefined
beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, '', '/')
  document.body.innerHTML = '<main>Prototype</main>'
  localStorage.setItem('corktack:comments:demo', JSON.stringify([seed('a', 'Priya'), seed('b', 'Sam')]))
})
afterEach(() => stop?.())

describe('onOpen and onClose', () => {
  it('fire as threads open and close, closing the old one before opening the next', async () => {
    const calls: string[] = []
    stop = initFeedback({
      project: 'demo',
      adapter: localAdapter(),
      onOpen: (c) => calls.push(`open ${c.id}`),
      onClose: (c) => calls.push(`close ${c.id}`),
    })
    await vi.waitFor(() => expect(overlay()).not.toBeNull())
    await vi.waitFor(() => expect((overlay() as unknown as { comments: unknown[] }).comments).toHaveLength(2))

    await openCard({ kind: 'thread', id: 'a' })
    await openCard({ kind: 'thread', id: 'b' })
    await openCard({ kind: 'none' })
    expect(calls).toEqual(['open a', 'close a', 'open b', 'close b'])
  })

  it('closes the open thread when comments are turned off', async () => {
    const closed = vi.fn()
    stop = initFeedback({ project: 'demo', adapter: localAdapter(), onClose: closed })
    await vi.waitFor(() => expect(overlay()).not.toBeNull())
    await vi.waitFor(() => expect((overlay() as unknown as { comments: unknown[] }).comments).toHaveLength(2))
    await openCard({ kind: 'thread', id: 'a' })
    stop()
    stop = undefined
    expect(closed).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }))
  })

  it('keeps going when a callback throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    stop = initFeedback({ project: 'demo', adapter: localAdapter(), onOpen: () => { throw new Error('boom') } })
    await vi.waitFor(() => expect(overlay()).not.toBeNull())
    await vi.waitFor(() => expect((overlay() as unknown as { comments: unknown[] }).comments).toHaveLength(2))
    await openCard({ kind: 'thread', id: 'a' })
    expect(warn).toHaveBeenCalled()
    expect(overlay()!.shadowRoot!.querySelector('ct-thread')).not.toBeNull()
    warn.mockRestore()
  })
})
