// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ViewRecorder, currentViewUrl, replaySteps } from '../src/view'

beforeAll(() => {
  // jsdom has no CSS.escape or layout. Elements under [hidden] take no space; everything else does.
  ;(globalThis as { CSS?: unknown }).CSS ??= { escape: (v: string) => v.replace(/[^\w-]/g, '\\$&') }
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const size = this.isConnected && !this.closest('[hidden]') ? 100 : 0
    return { left: 0, top: 0, x: 0, y: 0, width: size, height: size, right: size, bottom: size, toJSON() {} } as DOMRect
  }
})

let stop: (() => void) | undefined
let ignoring = false
const record = () => {
  const recorder = new ViewRecorder('data-feedback', 'feedback', () => ignoring)
  stop = recorder.start()
  return recorder
}
/** A real press: pointerdown then click. */
const press = (el: Element) => {
  el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
}
/** Lets the mutation observer run. */
const settle = () => new Promise((r) => setTimeout(r, 0))
const $ = (selector: string) => document.querySelector(selector)!

beforeEach(() => {
  history.replaceState(null, '', '/roster')
  ignoring = false
})
afterEach(() => {
  stop?.()
  document.body.innerHTML = ''
})

describe('ViewRecorder', () => {
  it('keeps the press that opened a drawer holding the pinned element', async () => {
    document.body.innerHTML = '<main><button id="notes">Shift notes</button><button id="like">Like</button></main>'
    $('#notes').addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<aside><p id="target">Tuesday is short one educator</p></aside>')
    })
    $('#like').addEventListener('click', () => $('main').classList.toggle('liked'))
    const recorder = record()

    press($('#notes'))
    await settle()
    press($('#like'))
    await settle()

    const view = recorder.viewFor($('#target'))
    expect(view.url).toBe('/roster')
    expect(view.steps).toHaveLength(1)
    expect(view.steps[0]).toMatchObject({ tag: 'button', text: 'Shift notes' })
  })

  it('follows a chain of presses, oldest first', async () => {
    document.body.innerHTML = '<main><button id="menu">Options</button></main>'
    $('#menu').addEventListener('click', () => {
      $('main').insertAdjacentHTML('beforeend', '<ul><li><button id="details">Show details</button></li></ul>')
      $('#details').addEventListener('click', () => {
        document.body.insertAdjacentHTML('beforeend', '<section><p id="target">Details here</p></section>')
      })
    })
    const recorder = record()

    press($('#menu'))
    await settle()
    press($('#details'))
    await settle()

    expect(recorder.viewFor($('#target')).steps.map((s) => s.text)).toEqual(['Options', 'Show details'])
  })

  it('leaves out presses that revealed nothing around the element', async () => {
    document.body.innerHTML = '<main><p id="target">Always here</p><button id="other">Other</button><div id="elsewhere"></div></main>'
    $('#other').addEventListener('click', () => $('#elsewhere').append(document.createElement('span')))
    const recorder = record()
    press($('#other'))
    await settle()
    expect(recorder.viewFor($('#target')).steps).toEqual([])
  })

  it('never keeps a press that submits a form', async () => {
    document.body.innerHTML = '<form><button id="save">Save</button></form>'
    $('form').addEventListener('submit', (e) => e.preventDefault())
    $('#save').addEventListener('click', () => {
      document.body.insertAdjacentHTML('beforeend', '<p id="target">Saved</p>')
    })
    const recorder = record()
    press($('#save'))
    await settle()
    expect(recorder.viewFor($('#target')).steps).toEqual([])
  })

  it('ignores presses it is told to, such as the widget’s own', async () => {
    document.body.innerHTML = '<button id="open">Open</button>'
    $('#open').addEventListener('click', () => document.body.insertAdjacentHTML('beforeend', '<p id="target">Opened</p>'))
    const recorder = record()
    ignoring = true
    press($('#open'))
    await settle()
    expect(recorder.viewFor($('#target')).steps).toEqual([])
  })

  it('forgets presses made at another address', async () => {
    document.body.innerHTML = '<button id="open">Open</button>'
    $('#open').addEventListener('click', () => document.body.insertAdjacentHTML('beforeend', '<p id="target">Opened</p>'))
    const recorder = record()
    press($('#open'))
    await settle()
    history.replaceState(null, '', '/roster?week=2')
    expect(recorder.viewFor($('#target')).steps).toEqual([])
  })
})

describe('currentViewUrl', () => {
  it('keeps the query and hash, without Corktack’s own parameters', () => {
    history.replaceState(null, '', '/roster?feedback=1&week=2&comment=abc#tuesday')
    expect(currentViewUrl('feedback')).toBe('/roster?week=2#tuesday')
  })
})

describe('replaySteps', () => {
  it('opens what the comment was left in, and leaves it alone when already open', async () => {
    document.body.innerHTML = '<main><button id="toggle">Shift notes</button><aside hidden><p id="target">Tuesday is short</p></aside></main>'
    let presses = 0
    $('#toggle').addEventListener('click', () => {
      presses++
      $('aside').toggleAttribute('hidden')
    })
    const recorder = record()
    press($('#toggle'))
    await settle()
    const view = recorder.viewFor($('#target'))
    const final = { selector: '#target', strategy: 'hook' as const, tag: 'p', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
    expect(view.steps).toHaveLength(1)
    stop?.()

    // Closed: one press opens it.
    $('aside').setAttribute('hidden', '')
    presses = 0
    await replaySteps(view.steps, final, 500)
    expect(presses).toBe(1)
    expect($('aside').hasAttribute('hidden')).toBe(false)

    // Already open: no press, so the toggle isn't closed again.
    await replaySteps(view.steps, final, 500)
    expect(presses).toBe(1)
    expect($('aside').hasAttribute('hidden')).toBe(false)
  })

  it('gives up quietly when a step can no longer be found', async () => {
    document.body.innerHTML = '<p id="target" hidden>Gone</p>'
    const step = { selector: '#missing', strategy: 'hook' as const, tag: 'button', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
    const final = { selector: '#target', strategy: 'hook' as const, tag: 'p', xPct: 0.5, yPct: 0.5, pageX: 0, pageY: 0 }
    await expect(replaySteps([step], final, 200)).resolves.toBeUndefined()
  })
})
