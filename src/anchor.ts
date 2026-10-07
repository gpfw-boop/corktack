import type { Anchor } from './types'
import { normalise } from './util'

const TEXT_LENGTH = 80

/** Ids that look generated (React useId, hashes, numeric suffixes) make poor anchors. */
const isStableId = (id: string): boolean =>
  !!id && !id.startsWith(':') && !/\d{3,}/.test(id) && !/^[a-f0-9-]{8,}$/i.test(id)

const isUnique = (selector: string): boolean => {
  try {
    return document.querySelectorAll(selector).length === 1
  } catch {
    return false
  }
}

/** A stable, unique selector for this exact element, if it has one. */
function hookFor(el: Element, hookAttr: string): string | null {
  const candidates: string[] = []
  const hook = el.getAttribute(hookAttr)
  if (hook) candidates.push(`[${hookAttr}="${CSS.escape(hook)}"]`)
  const testId = el.getAttribute('data-testid')
  if (testId) candidates.push(`[data-testid="${CSS.escape(testId)}"]`)
  if (isStableId(el.id)) candidates.push(`#${CSS.escape(el.id)}`)
  return candidates.find(isUnique) ?? null
}

/**
 * One structural step. Deliberately ignores classes and attributes, because
 * Vue's scoped style hashes (data-v-xxxx) and CSS module class names change
 * between builds.
 */
function stepFor(el: Element): string {
  const tag = el.tagName.toLowerCase()
  const parent = el.parentElement
  if (!parent) return tag
  const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName)
  return siblings.length > 1 ? `${tag}:nth-of-type(${siblings.indexOf(el) + 1})` : tag
}

export function buildSelector(el: Element, hookAttr: string): Pick<Anchor, 'selector' | 'strategy'> {
  const parts: string[] = []
  let node: Element | null = el
  while (node && node !== document.documentElement) {
    const hook = hookFor(node, hookAttr)
    if (hook) {
      parts.unshift(hook)
      return { selector: parts.join(' > '), strategy: parts.length === 1 ? 'hook' : 'hook+path' }
    }
    if (node === document.body) {
      parts.unshift('body')
      break
    }
    parts.unshift(stepFor(node))
    node = node.parentElement
  }
  return { selector: parts.join(' > '), strategy: 'path' }
}

export function createAnchor(el: Element, clientX: number, clientY: number, hookAttr: string): Anchor {
  const rect = el.getBoundingClientRect()
  const clamp = (n: number) => Math.min(1, Math.max(0, n))
  const text = normalise(el.textContent).slice(0, TEXT_LENGTH)
  return {
    ...buildSelector(el, hookAttr),
    tag: el.tagName.toLowerCase(),
    xPct: rect.width ? clamp((clientX - rect.left) / rect.width) : 0.5,
    yPct: rect.height ? clamp((clientY - rect.top) / rect.height) : 0.5,
    text: text.length >= 3 ? text : undefined,
    pageX: Math.round(clientX + window.scrollX),
    pageY: Math.round(clientY + window.scrollY),
  }
}

const textMatches = (el: Element, text: string): boolean => normalise(el.textContent).startsWith(text)

function findByText(anchor: Anchor): Element | null {
  if (!anchor.text) return null
  const matches = Array.from(document.body.querySelectorAll(anchor.tag)).filter((el) =>
    textMatches(el, anchor.text!),
  )
  // Prefer the most specific match: one that contains no other match.
  return matches.find((el) => !matches.some((other) => other !== el && el.contains(other))) ?? null
}

/**
 * Re-find the anchored element. Order: selector with matching text, then text
 * search, then the selector alone (content may have been edited).
 */
export function findElement(anchor: Anchor): Element | null {
  let bySelector: Element | null = null
  try {
    bySelector = document.querySelector(anchor.selector)
  } catch {
    bySelector = null
  }
  if (bySelector && (!anchor.text || textMatches(bySelector, anchor.text))) return bySelector
  return findByText(anchor) ?? bySelector
}

/** Viewport position for a pin, or null if the element is missing or hidden. */
export function pointFor(el: Element, anchor: Anchor): { x: number; y: number } | null {
  // Content in a closed <details> keeps its size in Chrome, so ask the browser whether it's shown.
  if ('checkVisibility' in el && !el.checkVisibility({ visibilityProperty: true })) return null
  const rect = el.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) return null
  return { x: rect.left + anchor.xPct * rect.width, y: rect.top + anchor.yPct * rect.height }
}
