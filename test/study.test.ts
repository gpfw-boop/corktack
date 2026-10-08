// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { initFeedback } from '../src/index'
import type { Study } from '../src/types'

const study: Study = {
  title: 'Roster check',
  tasks: [
    { title: 'Find week 2', start: '/', goal: { url: '/roster?week=2' } },
    { title: 'Confirm the roster', goal: { press: 'confirm-roster' } },
  ],
}

const bar = () => document.querySelector('corktack-study') as (HTMLElement & { updateComplete: Promise<unknown> }) | null
const text = () => bar()!.shadowRoot!.textContent!.replace(/\s+/g, ' ')
const press = (label: string) =>
  [...bar()!.shadowRoot!.querySelectorAll('button')].find((b) => b.textContent!.includes(label))!.click()
/** Waits for the study code to load and render. */
const ready = async () => {
  await vi.waitFor(() => expect(bar()).not.toBeNull())
  await bar()!.updateComplete
}
const rendered = async () => {
  await bar()!.updateComplete
}

let stop: (() => void) | undefined
beforeEach(() => {
  sessionStorage.clear()
  document.body.innerHTML = '<button data-feedback="confirm-roster">Confirm roster</button>'
})
afterEach(() => {
  stop?.()
  vi.useRealTimers()
})

describe('study mode', () => {
  it('opens from a study link, with no tab or comments', async () => {
    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    expect(text()).toContain('Roster check')
    expect(document.querySelector('corktack-launcher')).toBeNull()
    expect(document.querySelector('corktack-overlay')).toBeNull()
  })

  it('takes someone through each task, finishing them on their goals', async () => {
    history.replaceState(null, '', '/roster?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()

    press('Start')
    await rendered()
    expect(text()).toContain('Task 1 of 2')
    press('Start task')
    await rendered()
    expect(location.pathname).toBe('/')

    // Reaching the goal address finishes the task.
    vi.useFakeTimers()
    history.pushState(null, '', '/roster?week=2')
    await rendered()
    expect(text()).toContain('Task done')
    await vi.advanceTimersByTimeAsync(1500)
    await rendered()
    expect(text()).toContain('Task 2 of 2')

    // Pressing the tagged element finishes the next one.
    press('Start task')
    await rendered()
    ;(document.querySelector('[data-feedback="confirm-roster"]') as HTMLElement).click()
    await rendered()
    expect(text()).toContain('Task done')
    await vi.advanceTimersByTimeAsync(1500)
    await rendered()
    expect(text()).toContain('That’s everything')

    press('Finish')
    expect(bar()).toBeNull()
    expect(sessionStorage.getItem('corktack:study')).toBeNull()
  })

  it('moves on when they press Done, with or without a goal', async () => {
    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    press('Start')
    await rendered()
    press('Start task')
    await rendered()
    vi.useFakeTimers()
    expect(text()).not.toContain('stuck')
    press('Done')
    await rendered()
    expect(text()).toContain('Task done')
    await vi.advanceTimersByTimeAsync(1500)
    await rendered()
    expect(text()).toContain('Task 2 of 2')
  })

  it('keeps their place across a reload', async () => {
    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    press('Start')
    await rendered()
    press('Start task')
    await rendered()
    stop()

    history.replaceState(null, '', '/')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    expect(text()).toContain('Find week 2')
    expect(text()).toContain('Done')
  })

  it('tucks away off the top, keeping that across a reload, and comes back from its handle', async () => {
    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    press('Start')
    await rendered()
    press('Start task')
    await rendered()
    const dock = () => bar()!.shadowRoot!.querySelector('.dock')!
    ;(bar()!.shadowRoot!.querySelector('[aria-label="Hide task"]') as HTMLElement).click()
    await rendered()
    // Hidden straight away, even with the pointer still on it, until the pointer moves onto the handle.
    expect(dock().classList.contains('hidden')).toBe(true)
    expect(dock().classList.contains('settling')).toBe(true)
    bar()!.shadowRoot!.querySelector('.handle')!.dispatchEvent(new Event('pointermove'))
    await rendered()
    expect(dock().classList.contains('settling')).toBe(false)
    stop()

    stop = initFeedback({ studies: { roster: study } })
    await ready()
    expect(dock().classList.contains('hidden')).toBe(true)
    ;(bar()!.shadowRoot!.querySelector('.handle') as HTMLElement).click()
    await rendered()
    expect(dock().classList.contains('hidden')).toBe(false)
  })

  it('ignores a study the prototype doesn’t have, and ends with ?study=off', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    history.replaceState(null, '', '/?study=nope')
    stop = initFeedback({ studies: { roster: study } })
    expect(warn).toHaveBeenCalled()
    expect(document.querySelector('corktack-launcher')).not.toBeNull()
    stop()

    history.replaceState(null, '', '/?study=roster')
    stop = initFeedback({ studies: { roster: study } })
    await ready()
    stop()
    history.replaceState(null, '', '/?study=off')
    stop = initFeedback({ studies: { roster: study } })
    expect(sessionStorage.getItem('corktack:study')).toBeNull()
    expect(document.querySelector('corktack-launcher')).not.toBeNull()
    warn.mockRestore()
  })
})
