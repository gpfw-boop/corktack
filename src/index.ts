import { localAdapter } from './storage'
import type { FeedbackOptions } from './types'
import { defaultRoute } from './util'

export type { Anchor, FeedbackComment, FeedbackOptions, NewComment, StorageAdapter } from './types'
export { localAdapter } from './storage'
export { supabaseAdapter, type SupabaseAdapterOptions } from './supabase'

const MODE_KEY = 'corktack:mode'

/**
 * Reads the activation parameter. The mode is kept in sessionStorage so it
 * survives client-side navigation (Vue Router often drops query strings).
 *
 *   ?feedback=1    turn feedback on
 *   ?feedback=off  turn it off again
 */
function isActive(param: string): boolean {
  const value = new URLSearchParams(window.location.search).get(param)
  const off = value === 'off' || value === '0'
  try {
    if (off) sessionStorage.removeItem(MODE_KEY)
    else if (value !== null) sessionStorage.setItem(MODE_KEY, 'on')
    return sessionStorage.getItem(MODE_KEY) === 'on'
  } catch {
    return value !== null && !off
  }
}

let historyPatched = false

/** Emits corktack:navigate on SPA route changes so pins can be redrawn. */
function watchNavigation(): void {
  if (historyPatched) return
  historyPatched = true
  const notify = () => window.dispatchEvent(new Event('corktack:navigate'))
  for (const method of ['pushState', 'replaceState'] as const) {
    const original = history[method]
    history[method] = function (this: History, ...args: Parameters<History['pushState']>) {
      const result = original.apply(this, args)
      notify()
      return result
    }
  }
  window.addEventListener('popstate', notify)
  window.addEventListener('hashchange', notify)
}

/**
 * Adds the feedback overlay when the page is opened with ?feedback=1. Does
 * nothing otherwise, so it is safe to ship to every visitor. Returns a
 * function that removes the overlay.
 */
export function initFeedback(options: FeedbackOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}
  if (!isActive(options.param ?? 'feedback')) return () => {}

  watchNavigation()

  const config = {
    project: options.project ?? window.location.host,
    adapter: options.adapter ?? localAdapter(),
    hookAttribute: options.hookAttribute ?? 'data-feedback',
    getRoute: options.getRoute ?? defaultRoute,
  }

  // The UI (and Lit) load only when feedback mode is on, so normal visitors don't pay for them.
  let overlay: HTMLElement | undefined
  let removed = false
  const mount = () =>
    import('./overlay').then(({ mountOverlay }) => {
      if (!removed) overlay = mountOverlay(config)
    })
  if (document.body) void mount()
  else document.addEventListener('DOMContentLoaded', () => void mount(), { once: true })

  return () => {
    removed = true
    overlay?.remove()
  }
}
