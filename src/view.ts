import { createAnchor, findElement, pointFor } from './anchor'
import type { Anchor, CommentView } from './types'

/*
 * Reopening the view a comment was left in. Two parts:
 *
 * - The address: path, query and hash, so tabs and filters kept in the URL come back.
 * - The clicks that revealed the pinned element, such as opening a drawer, a
 *   tab or an accordion. While feedback mode is on, the recorder remembers
 *   recent clicks on this page and what each one added or changed. When a
 *   comment is pinned, it keeps only the clicks whose changes contain the
 *   pinned element, then the clicks that revealed those, and so on.
 *
 * Replaying skips any step whose result is already showing, so a toggle that's
 * already open isn't closed again.
 */

/** Query parameter in comment links. */
export const COMMENT_PARAM = 'comment'

/** How long after a press its changes still count, for slide-ins and async renders. */
const SETTLE_MS = 1200
const MAX_CLICKS = 12
const MAX_STEPS = 4
const MAX_CHANGED = 300

/** The current address without Corktack's own parameters. */
export function currentViewUrl(param: string): string {
  const url = new URL(window.location.href)
  url.searchParams.delete(param)
  url.searchParams.delete(COMMENT_PARAM)
  return url.pathname + url.search + url.hash
}

/**
 * The element a press really meant: the nearest button, link or other control.
 * Null for presses that submit a form, which must never be replayed.
 */
function control(target: Element): Element | null {
  const el =
    target.closest('button, a[href], summary, label, select, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [tabindex]') ??
    target
  if (el.matches('input[type="submit"], input[type="image"]')) return null
  if (el instanceof HTMLButtonElement && el.type === 'submit' && el.form) return null
  return el
}

interface Press {
  el: Element
  anchor: Anchor
  url: string
  at: number
  /** Elements added or changed after the press. */
  changed: Set<Element>
}

export class ViewRecorder {
  private presses: Press[] = []

  constructor(
    private readonly hookAttr: string,
    private readonly param: string,
    /** Presses to leave out: the widget's own, pin drops and replays. */
    private readonly ignore: (e: Event) => boolean,
  ) {}

  /** Starts recording. Returns a function that stops it. */
  start(): () => void {
    // Pointerdown catches controls that open on press; click catches keyboard activation.
    const onPress = (e: Event) => {
      if (this.ignore(e) || !(e.target instanceof Element)) return
      const el = control(e.target)
      if (!el) return
      const last = this.presses[this.presses.length - 1]
      if (e.type === 'click' && last?.el === el && Date.now() - last.at < 1000) return
      const { clientX = 0, clientY = 0 } = e as MouseEvent
      const url = currentViewUrl(this.param)
      // Presses on another address are covered by the address itself.
      this.presses = this.presses.filter((p) => p.url === url).slice(-(MAX_CLICKS - 1))
      this.presses.push({ el, anchor: createAnchor(el, clientX, clientY, this.hookAttr), url, at: Date.now(), changed: new Set() })
    }
    document.addEventListener('pointerdown', onPress, true)
    document.addEventListener('click', onPress, true)

    const observer = new MutationObserver((records) => {
      const now = Date.now()
      const open = this.presses.filter((p) => now - p.at <= SETTLE_MS)
      if (!open.length) return
      for (const record of records) {
        const nodes = record.type === 'childList' ? Array.from(record.addedNodes) : [record.target]
        for (const node of nodes) {
          // Changes to the whole page would make every press look like it revealed everything.
          if (!(node instanceof Element) || node === document.body || node === document.documentElement) continue
          for (const press of open) if (press.changed.size < MAX_CHANGED) press.changed.add(node)
        }
      }
    })
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'open', 'aria-hidden'],
    })

    return () => {
      document.removeEventListener('pointerdown', onPress, true)
      document.removeEventListener('click', onPress, true)
      observer.disconnect()
      this.presses = []
    }
  }

  /** The view to save with a comment pinned on `el`. */
  viewFor(el: Element): CommentView {
    const url = currentViewUrl(this.param)
    const presses = this.presses.filter((p) => p.url === url)
    const steps: Anchor[] = []
    let target = el
    for (let i = presses.length - 1; i >= 0 && steps.length < MAX_STEPS; i--) {
      const press = presses[i]
      if (press.el === target || press.el.contains(target)) continue
      if (![...press.changed].some((node) => node.contains(target))) continue
      steps.unshift(press.anchor)
      target = press.el
    }
    return { url, steps }
  }
}

/** True when the anchored element exists and takes up space on screen. */
export function isShown(anchor: Anchor): boolean {
  return !!shownElement(anchor)
}

function shownElement(anchor: Anchor): Element | null {
  const el = findElement(anchor)
  return el && pointFor(el, anchor) ? el : null
}

/** Polls until `fn` returns something truthy, or gives up after `ms`. */
export async function waitFor<T>(fn: () => T | null | false, ms: number): Promise<T | null> {
  const until = Date.now() + ms
  for (;;) {
    const value = fn()
    if (value) return value
    if (Date.now() >= until) return null
    await new Promise((r) => setTimeout(r, 100))
  }
}

/** A full press at the recorded spot, for controls that open on pointerdown as well as click. */
function press(el: Element, anchor: Anchor): void {
  const rect = el.getBoundingClientRect()
  const init = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: rect.left + anchor.xPct * rect.width,
    clientY: rect.top + anchor.yPct * rect.height,
    button: 0,
  }
  const Pointer = typeof PointerEvent === 'function' ? PointerEvent : MouseEvent
  el.dispatchEvent(new Pointer('pointerdown', { ...init, isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mousedown', init))
  el.dispatchEvent(new Pointer('pointerup', { ...init, isPrimary: true }))
  el.dispatchEvent(new MouseEvent('mouseup', init))
  el.dispatchEvent(new MouseEvent('click', init))
}

/**
 * Replays the steps that lead to `final`, skipping any whose result is already
 * showing. `firstWait` is how long to wait for the page to render the first step.
 */
export async function replaySteps(steps: Anchor[], final: Anchor, firstWait: number): Promise<void> {
  let wait = firstWait
  for (let i = 0; i < steps.length; i++) {
    const next = steps[i + 1] ?? final
    if (isShown(next)) continue
    const el = await waitFor(() => shownElement(steps[i]), wait)
    if (!el) return
    press(el, steps[i])
    await waitFor(() => isShown(next), SETTLE_MS)
    wait = SETTLE_MS
  }
}
