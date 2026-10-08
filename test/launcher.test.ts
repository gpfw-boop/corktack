// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Stand-in for the overlay, which loads Lit; these tests are about turning it on and off.
const mounted: Array<{ onClose: () => void }> = []
vi.mock('../src/overlay', () => ({
  mountOverlay: (config: { onClose: () => void }) => {
    mounted.push(config)
    const el = document.createElement('corktack-overlay')
    document.body.append(el)
    return el
  },
}))

const { initFeedback } = await import('../src/index')

const tab = () => document.querySelector('corktack-launcher')
const overlay = () => document.querySelector('corktack-overlay')
const tabButton = () => tab()!.shadowRoot!.querySelector('button')!
const settle = () => new Promise((r) => setTimeout(r, 0))

let stop: (() => void) | undefined
beforeEach(() => {
  sessionStorage.clear()
  mounted.length = 0
  history.replaceState(null, '', '/')
})
afterEach(() => {
  stop?.()
  document.body.innerHTML = ''
})

describe('the hidden tab', () => {
  it('is all a visitor gets, until they click it', async () => {
    stop = initFeedback()
    expect(tab()).not.toBeNull()
    expect(overlay()).toBeNull()

    tabButton().click()
    await settle()
    expect(overlay()).not.toBeNull()
    expect(tab()).toBeNull()
    expect(sessionStorage.getItem('corktack:mode')).toBe('on')
  })

  it('comes back when comments are turned off', async () => {
    stop = initFeedback()
    tabButton().click()
    await settle()
    mounted[0].onClose()
    expect(overlay()).toBeNull()
    expect(tab()).not.toBeNull()
    expect(sessionStorage.getItem('corktack:mode')).toBeNull()
  })

  it('stays away when the link turns comments on', async () => {
    history.replaceState(null, '', '/?feedback=1')
    stop = initFeedback()
    await settle()
    expect(overlay()).not.toBeNull()
    expect(tab()).toBeNull()
  })

  it('can be switched off for a prototype', () => {
    stop = initFeedback({ launcher: false })
    expect(tab()).toBeNull()
    expect(overlay()).toBeNull()
  })

  it('keeps presses on it from reaching the page', () => {
    stop = initFeedback()
    const pageHeard = vi.fn()
    document.addEventListener('pointerdown', pageHeard)
    tabButton().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, composed: true }))
    document.removeEventListener('pointerdown', pageHeard)
    expect(pageHeard).not.toHaveBeenCalled()
  })
})
