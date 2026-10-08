import { mountLauncher } from './launcher'
import { localAdapter } from './storage'
import type { FeedbackOptions } from './types'
import { defaultRoute } from './util'

export type { Anchor, CommentView, FeedbackComment, FeedbackOptions, NewComment, StorageAdapter } from './types'
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
  if (off) setMode(false)
  else if (value !== null) setMode(true)
  try {
    return sessionStorage.getItem(MODE_KEY) === 'on'
  } catch {
    return value !== null && !off
  }
}

function setMode(on: boolean): void {
  try {
    if (on) sessionStorage.setItem(MODE_KEY, 'on')
    else sessionStorage.removeItem(MODE_KEY)
  } catch {
    // Without sessionStorage, the mode lasts until the page reloads.
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
 * Adds Corktack to the page. Visitors see only a sliver of a tab at the bottom
 * edge; clicking it, or opening the page with ?feedback=1, turns comments on.
 * Nothing else loads until then. Returns a function that removes everything.
 */
export function initFeedback(options: FeedbackOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}
  const param = options.param ?? 'feedback'

  let overlay: HTMLElement | undefined
  let removeLauncher: (() => void) | undefined
  let removed = false

  const config = {
    project: options.project ?? window.location.host,
    param,
    adapter: options.adapter ?? localAdapter(),
    hookAttribute: options.hookAttribute ?? 'data-feedback',
    getRoute: options.getRoute ?? defaultRoute,
    onClose: () => {
      setMode(false)
      overlay?.remove()
      overlay = undefined
      showLauncher()
    },
  }

  // The UI (and Lit) load only when comments are turned on, so normal visitors don't pay for them.
  const open = () => {
    watchNavigation()
    void import('./overlay').then(({ mountOverlay }) => {
      if (!removed && !overlay) overlay = mountOverlay(config)
    })
  }

  const showLauncher = () => {
    // Bundled with the core rather than loaded on demand, so visitors make no extra requests.
    if (removed || overlay || options.launcher === false) return
    removeLauncher = mountLauncher(() => {
      removeLauncher?.()
      removeLauncher = undefined
      setMode(true)
      open()
    })
  }

  const start = () => (isActive(param) ? open() : showLauncher())
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })

  return () => {
    removed = true
    overlay?.remove()
    removeLauncher?.()
  }
}
