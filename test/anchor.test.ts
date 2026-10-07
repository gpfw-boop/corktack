// @vitest-environment jsdom
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { buildSelector, createAnchor, findElement, pointFor } from '../src/anchor'

// jsdom has no CSS.escape. This is the algorithm from the CSSOM spec.
beforeAll(() => {
  if (globalThis.CSS?.escape) return
  const escape = (value: string) =>
    Array.from(value, (ch, i) => {
      const code = ch.codePointAt(0)!
      if (code === 0) return '�'
      if ((code >= 0x1 && code <= 0x1f) || code === 0x7f) return `\\${code.toString(16)} `
      if (i === 0 && code >= 0x30 && code <= 0x39) return `\\${code.toString(16)} `
      if (i === 1 && code >= 0x30 && code <= 0x39 && value[0] === '-') return `\\${code.toString(16)} `
      if (i === 0 && value.length === 1 && ch === '-') return '\\-'
      if (code >= 0x80 || ch === '-' || ch === '_' || /[0-9A-Za-z]/.test(ch)) return ch
      return `\\${ch}`
    }).join('')
  ;(globalThis as { CSS?: unknown }).CSS = { escape }
})

/** jsdom doesn't do layout, so give elements a box. */
function setBox(el: Element, box: { left: number; top: number; width: number; height: number }) {
  el.getBoundingClientRect = () =>
    ({ ...box, x: box.left, y: box.top, right: box.left + box.width, bottom: box.top + box.height, toJSON() {} }) as DOMRect
}

/**
 * A page the way a Vue build renders it: scoped style hashes on every
 * element and generated class names. `build` changes both, like a rebuild.
 */
function render(build: string, extra = '') {
  document.body.innerHTML = `
    <header data-v-${build} class="header_${build}"><nav><a href="/">Home</a><a href="/roster">Roster</a></nav></header>
    <main data-v-${build} class="main_${build}">
      ${extra}
      <h1 data-v-${build}>Welcome back, Priya</h1>
      <section data-v-${build} class="card_${build}">
        <h2 data-v-${build}>Today</h2>
        <p data-v-${build}>Three educators are rostered for the Joeys room.</p>
        <button data-v-${build} data-feedback="confirm-roster"><span>Confirm roster</span></button>
      </section>
      <section data-v-${build} class="card_${build}">
        <h2 data-v-${build}>Messages</h2>
        <p data-v-${build}>Two families have replied to the newsletter.</p>
        <ul><li>Newsletter</li><li id=":r3:">Generated id</li><li id="item-48213">Numbered id</li><li data-testid="excursion">Excursion</li></ul>
      </section>
    </main>`
}

const $ = (selector: string) => document.querySelector(selector)!
const messagesParagraph = () =>
  Array.from(document.querySelectorAll('p')).find((p) => p.textContent!.includes('families'))!

beforeEach(() => render('3f2a9c1b'))

describe('buildSelector', () => {
  it('uses a data-feedback hook on the element itself', () => {
    expect(buildSelector($('[data-feedback="confirm-roster"]'), 'data-feedback')).toEqual({
      selector: '[data-feedback="confirm-roster"]',
      strategy: 'hook',
    })
  })

  it('builds a path from the nearest hook for elements inside it', () => {
    const span = $('[data-feedback="confirm-roster"] span')
    expect(buildSelector(span, 'data-feedback')).toEqual({ selector: '[data-feedback="confirm-roster"] > span', strategy: 'hook+path' })
  })

  it('uses data-testid and stable ids', () => {
    expect(buildSelector($('[data-testid="excursion"]'), 'data-feedback').selector).toBe('[data-testid="excursion"]')
    document.querySelector('h1')!.id = 'welcome'
    expect(buildSelector($('h1'), 'data-feedback').selector).toBe('#welcome')
  })

  it('ignores generated ids', () => {
    const items = document.querySelectorAll('li')
    expect(buildSelector(items[1], 'data-feedback').strategy).toBe('path')
    expect(buildSelector(items[2], 'data-feedback').strategy).toBe('path')
  })

  it('ignores hooks that are not unique', () => {
    document.querySelectorAll('h2').forEach((h) => h.setAttribute('data-feedback', 'heading'))
    expect(buildSelector($('h2'), 'data-feedback').strategy).toBe('path')
  })

  it('never includes classes or Vue scoped attributes', () => {
    const { selector, strategy } = buildSelector(messagesParagraph(), 'data-feedback')
    expect(strategy).toBe('path')
    expect(selector).toBe('body > main > section:nth-of-type(2) > p')
    expect(selector).not.toMatch(/data-v|card_|\./)
  })

  it('picks the right sibling with nth-of-type', () => {
    const first = document.querySelectorAll('li')[0]
    const { selector } = buildSelector(first, 'data-feedback')
    expect(selector).toBe('body > main > section:nth-of-type(2) > ul > li:nth-of-type(1)')
    expect(document.querySelector(selector)).toBe(first)
  })
})

describe('createAnchor', () => {
  it('stores the click as fractions of the element box', () => {
    const p = messagesParagraph()
    setBox(p, { left: 100, top: 200, width: 400, height: 50 })
    const anchor = createAnchor(p, 200, 240, 'data-feedback')
    expect(anchor.xPct).toBeCloseTo(0.25)
    expect(anchor.yPct).toBeCloseTo(0.8)
    expect(anchor.tag).toBe('p')
    expect(anchor.text).toBe('Two families have replied to the newsletter.')
  })

  it('clamps clicks just outside the box', () => {
    const p = messagesParagraph()
    setBox(p, { left: 100, top: 200, width: 400, height: 50 })
    const anchor = createAnchor(p, 90, 260, 'data-feedback')
    expect(anchor.xPct).toBe(0)
    expect(anchor.yPct).toBe(1)
  })

  it('falls back to the centre of an element with no size', () => {
    const p = messagesParagraph()
    setBox(p, { left: 0, top: 0, width: 0, height: 0 })
    const anchor = createAnchor(p, 10, 10, 'data-feedback')
    expect([anchor.xPct, anchor.yPct]).toEqual([0.5, 0.5])
  })

  it('skips very short text', () => {
    const anchor = createAnchor(document.querySelector('nav a')!, 0, 0, 'data-feedback')
    expect(anchor.text).toBe('Home')
    document.querySelector('nav a')!.textContent = 'Hi'
    expect(createAnchor(document.querySelector('nav a')!, 0, 0, 'data-feedback').text).toBeUndefined()
  })
})

describe('findElement', () => {
  it('survives a rebuild that changes Vue scoped hashes and class names', () => {
    const anchor = createAnchor(messagesParagraph(), 0, 0, 'data-feedback')
    const hooked = createAnchor($('[data-feedback="confirm-roster"]'), 0, 0, 'data-feedback')
    render('9d81e0aa')
    expect(findElement(anchor)).toBe(messagesParagraph())
    expect(findElement(hooked)).toBe($('[data-feedback="confirm-roster"]'))
  })

  it('finds the element by its text when the structure changes', () => {
    const anchor = createAnchor(messagesParagraph(), 0, 0, 'data-feedback')
    render('3f2a9c1b', '<aside><p>New banner</p></aside><section><p>Extra section</p></section>')
    expect(findElement(anchor)).toBe(messagesParagraph())
  })

  it('prefers the text match when the path now points at a different element', () => {
    const anchor = createAnchor(messagesParagraph(), 0, 0, 'data-feedback')
    // Swap the two sections, so the old path lands on "Today".
    const [today, messages] = document.querySelectorAll('section')
    today.before(messages)
    expect(findElement(anchor)?.textContent).toBe('Two families have replied to the newsletter.')
  })

  it('still finds the element by its path after a copy edit', () => {
    const anchor = createAnchor(messagesParagraph(), 0, 0, 'data-feedback')
    messagesParagraph().textContent = 'Four families have replied to the newsletter.'
    expect(findElement(anchor)).toBe(messagesParagraph())
  })

  it('picks the most specific text match', () => {
    const anchor = createAnchor($('[data-feedback="confirm-roster"] span'), 0, 0, 'data-feedback')
    render('3f2a9c1b')
    document.querySelector('[data-feedback]')!.removeAttribute('data-feedback')
    const wrapper = document.createElement('div')
    wrapper.innerHTML = '<span><span>Confirm roster</span></span>'
    document.querySelector('main')!.append(wrapper)
    document.querySelectorAll('section')[0].querySelector('button')!.remove()
    expect(findElement(anchor)).toBe(wrapper.querySelector('span span'))
  })

  it('returns null when the element is gone', () => {
    const anchor = createAnchor(messagesParagraph(), 0, 0, 'data-feedback')
    document.body.innerHTML = '<main><p>Something else entirely</p></main>'
    expect(findElement(anchor)).toBeNull()
  })

  it('copes with a selector that is no longer valid', () => {
    const anchor = { ...createAnchor(messagesParagraph(), 0, 0, 'data-feedback'), selector: 'p:::' }
    expect(findElement(anchor)).toBe(messagesParagraph())
  })
})

describe('pointFor', () => {
  it('keeps the pin at the same spot on the element when the window is resized', () => {
    const p = messagesParagraph()
    setBox(p, { left: 100, top: 200, width: 400, height: 50 })
    const anchor = createAnchor(p, 200, 210, 'data-feedback')
    // Narrower window: the paragraph moves and shrinks.
    setBox(p, { left: 16, top: 520, width: 200, height: 100 })
    expect(pointFor(p, anchor)).toEqual({ x: 16 + 0.25 * 200, y: 520 + 0.2 * 100 })
  })

  it('returns null for hidden elements', () => {
    const p = messagesParagraph()
    setBox(p, { left: 100, top: 200, width: 400, height: 50 })
    const anchor = createAnchor(p, 200, 210, 'data-feedback')
    setBox(p, { left: 0, top: 0, width: 0, height: 0 })
    expect(pointFor(p, anchor)).toBeNull()
  })
})
