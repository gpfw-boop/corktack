import { localAdapter } from './storage'
import type { FeedbackOptions } from './types'
import { defaultRoute, studyProgressKey } from './util'

export type { Anchor, CommentView, FeedbackComment, FeedbackOptions, NewComment, StorageAdapter, Study, StudyTask } from './types'
export { localAdapter } from './storage'
export { supabaseAdapter, type SupabaseAdapterOptions } from './supabase'

const MODE_KEY = 'corktack:mode'
const STUDY_KEY = 'corktack:study'
const STUDY_PARAM = 'study'

/**
 * Comments are on unless turned off. The choice is kept in sessionStorage so it
 * survives client-side navigation (Vue Router often drops query strings).
 *
 *   ?feedback=0    turn Corktack off for this tab (?feedback=off works too)
 *   ?feedback=1    turn it back on
 */
function isOff(param: string): boolean {
  const value = new URLSearchParams(window.location.search).get(param)
  const off = value === '0' || value === 'off'
  try {
    if (off) sessionStorage.setItem(MODE_KEY, 'off')
    else if (value !== null) sessionStorage.removeItem(MODE_KEY)
    return sessionStorage.getItem(MODE_KEY) === 'off'
  } catch {
    return off
  }
}

/**
 * Reads ?study=<id> and remembers it for the tab, so the study survives
 * client-side navigation and reloads. ?study=off ends it. Returns the running
 * study's id, if it's one of the prototype's studies.
 */
function activeStudy(studies: FeedbackOptions['studies']): string | null {
  const value = new URLSearchParams(window.location.search).get(STUDY_PARAM)
  try {
    const current = sessionStorage.getItem(STUDY_KEY)
    if (value === 'off') endStudy()
    else if (value && value !== current) {
      if (studies?.[value]) {
        // A new study, or a different one: start it from the welcome.
        if (current) sessionStorage.removeItem(studyProgressKey(current))
        sessionStorage.setItem(STUDY_KEY, value)
      } else {
        console.warn(`[corktack] No study called "${value}". Add it to initFeedback({ studies }).`)
      }
    }
    const id = sessionStorage.getItem(STUDY_KEY)
    return id && studies?.[id] ? id : null
  } catch {
    return value && value !== 'off' && studies?.[value] ? value : null
  }
}

/** Leaves the running study. `forget` also drops its progress, so it starts again from the welcome. */
function endStudy(forget = true): void {
  try {
    const id = sessionStorage.getItem(STUDY_KEY)
    if (id && forget) sessionStorage.removeItem(studyProgressKey(id))
    sessionStorage.removeItem(STUDY_KEY)
  } catch {
    // Nothing kept.
  }
}

function setStudy(id: string): void {
  try {
    sessionStorage.setItem(STUDY_KEY, id)
  } catch {
    // The study lasts until the page reloads.
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
 * Adds Corktack to the page: comments are on for everyone unless the page is
 * opened with ?feedback=0. Prototypes with studies get a switch between
 * commenting and testing. Returns a function that removes everything.
 */
export function initFeedback(options: FeedbackOptions = {}): () => void {
  if (typeof window === 'undefined') return () => {}
  const param = options.param ?? 'feedback'
  const studies = options.studies ?? {}

  let overlay: HTMLElement | undefined
  let studyBar: HTMLElement | undefined
  let removed = false

  const config = {
    project: options.project ?? window.location.host,
    param,
    adapter: options.adapter ?? localAdapter(),
    hookAttribute: options.hookAttribute ?? 'data-feedback',
    getRoute: options.getRoute ?? defaultRoute,
    studies: Object.entries(studies).map(([id, study]) => ({ id, title: study.title })),
    onSwitchToStudy: (id: string) => {
      overlay?.remove()
      overlay = undefined
      setStudy(id)
      runStudy(id)
    },
  }

  // The UI and Lit load on demand, in their own chunks.
  const open = () => {
    watchNavigation()
    void import('./overlay').then(({ mountOverlay }) => {
      if (!removed && !overlay && !studyBar) overlay = mountOverlay(config)
    })
  }

  // A study keeps comments and pins away while it runs.
  const runStudy = (id: string) => {
    watchNavigation()
    void import('./study').then(({ mountStudy }) => {
      if (removed || !studies[id]) return
      studyBar = mountStudy({
        id,
        study: studies[id],
        hookAttribute: config.hookAttribute,
        // Switching keeps their place, so switching back carries on where they were.
        onSwitch: () => leaveStudy(false),
        onEnd: () => leaveStudy(true),
      })
    })
  }

  const leaveStudy = (forget: boolean) => {
    endStudy(forget)
    studyBar?.remove()
    studyBar = undefined
    open()
  }

  const study = activeStudy(studies)
  const off = isOff(param)
  const start = () => (study ? runStudy(study) : off ? undefined : open())
  if (document.body) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })

  return () => {
    removed = true
    overlay?.remove()
    studyBar?.remove()
  }
}
