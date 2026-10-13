// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Study } from '../src/types'

// Stand-in for the overlay, which loads Lit; these tests are about when it shows and switching modes.
const mounted: Array<{ studies: Array<{ id: string; title: string }>; onSwitchToStudy: (id: string) => void; onClose: () => void }> = []
vi.mock('../src/overlay', () => ({
  mountOverlay: (config: (typeof mounted)[number]) => {
    mounted.push(config)
    const el = document.createElement('corktack-overlay')
    document.body.append(el)
    return el
  },
}))

const { initFeedback } = await import('../src/index')

const study: Study = { title: 'Roster check', tasks: [{ title: 'Find week 2' }] }
const overlay = () => document.querySelector('corktack-overlay')
const studyBar = () => document.querySelector('corktack-study') as (HTMLElement & { updateComplete: Promise<unknown> }) | null
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

describe('comments are always on', () => {
  it('shows for every visitor, with no link needed', async () => {
    stop = initFeedback()
    await settle()
    expect(overlay()).not.toBeNull()
  })

  it('turns off with ?feedback=0, for the rest of the tab, and back on with ?feedback=1', async () => {
    history.replaceState(null, '', '/?feedback=0')
    stop = initFeedback()
    await settle()
    expect(overlay()).toBeNull()
    stop()

    history.replaceState(null, '', '/roster')
    stop = initFeedback()
    await settle()
    expect(overlay()).toBeNull()
    stop()

    history.replaceState(null, '', '/?feedback=1')
    stop = initFeedback()
    await settle()
    expect(overlay()).not.toBeNull()
  })
})

describe('closing comments with the toolbar’s ×', () => {
  const tab = () => document.querySelector('corktack-launcher')

  it('leaves a tab that brings them back', async () => {
    stop = initFeedback()
    await settle()
    mounted[0].onClose()
    expect(overlay()).toBeNull()
    expect(tab()).not.toBeNull()

    ;(tab()!.shadowRoot!.querySelector('button') as HTMLElement).click()
    await settle()
    expect(overlay()).not.toBeNull()
    expect(tab()).toBeNull()
  })

  it('stays closed across a reload, until ?feedback=1', async () => {
    stop = initFeedback()
    await settle()
    mounted[0].onClose()
    stop()

    stop = initFeedback()
    await settle()
    expect(overlay()).toBeNull()
    expect(tab()).not.toBeNull()
    stop()

    history.replaceState(null, '', '/?feedback=1')
    stop = initFeedback()
    await settle()
    expect(overlay()).not.toBeNull()
  })
})

describe('switching between commenting and testing', () => {
  it('offers the switch only when the prototype has studies', async () => {
    stop = initFeedback()
    await settle()
    expect(mounted[0].studies).toEqual([])
    stop()

    stop = initFeedback({ studies: { roster: study } })
    await settle()
    expect(mounted[1].studies).toEqual([{ id: 'roster', title: 'Roster check' }])
  })

  it('keeps participants who came by the study link in the study, even after a reload', async () => {
    const hasSwitch = () => !!studyBar()!.shadowRoot!.querySelector('[aria-label="Switch to feedback"]')
    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await vi.waitFor(() => expect(studyBar()).not.toBeNull())
    await studyBar()!.updateComplete
    expect(hasSwitch()).toBe(false)
    stop()

    history.replaceState(null, '', '/')
    stop = initFeedback({ studies: { roster: study } })
    await vi.waitFor(() => expect(studyBar()).not.toBeNull())
    await studyBar()!.updateComplete
    expect(hasSwitch()).toBe(false)
    expect(overlay()).toBeNull()
  })

  it('swaps comments for a study and back, keeping the study’s place', async () => {
    stop = initFeedback({ studies: { roster: study } })
    await settle()
    mounted[0].onSwitchToStudy('roster')
    await vi.waitFor(() => expect(studyBar()).not.toBeNull())
    expect(overlay()).toBeNull()
    expect(sessionStorage.getItem('corktack:study')).toBe('roster')

    // Start the study, then switch back to comments.
    await studyBar()!.updateComplete
    ;[...studyBar()!.shadowRoot!.querySelectorAll('button')].find((b) => b.textContent!.includes('Start'))!.click()
    await studyBar()!.updateComplete
    ;(studyBar()!.shadowRoot!.querySelector('[aria-label="Switch to feedback"]') as HTMLElement).click()
    await settle()
    expect(studyBar()).toBeNull()
    expect(overlay()).not.toBeNull()
    expect(sessionStorage.getItem('corktack:study')).toBeNull()

    // Switching back carries on from the task they were on, not the welcome.
    mounted[1].onSwitchToStudy('roster')
    await vi.waitFor(() => expect(studyBar()).not.toBeNull())
    await studyBar()!.updateComplete
    expect(studyBar()!.shadowRoot!.textContent).toContain('Task 1 of 1')
  })
})
