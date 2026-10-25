import type { FeedbackComment } from './types'
import { normalise } from './util'

/*
 * What this browser has read. A thread is unread when someone else has
 * commented or replied since it was last opened here. Kept per project in
 * localStorage, as times in milliseconds (server times, so the browser's
 * clock doesn't matter).
 *
 * The first time a browser sees a project, everything already there counts
 * as read, so a new reviewer isn't greeted by a wall of dots.
 */

export interface Seen {
  /** Activity at or before this counts as read. */
  baseline: number
  /** Per thread: activity at or before this counts as read. */
  threads: Record<string, number>
}

export type SortMode = 'unread' | 'recent'

const seenKey = (project: string) => `corktack:seen:${project}`
const SORT_KEY = 'corktack:sort'

const time = (iso: string): number => Date.parse(iso) || 0
const sameName = (a: string, b: string): boolean => normalise(a).toLowerCase() === normalise(b).toLowerCase()

/** Latest comment or reply in the thread, from anyone. */
export function latestActivity(thread: FeedbackComment, replies: FeedbackComment[]): number {
  return Math.max(time(thread.createdAt), ...replies.map((r) => time(r.createdAt)))
}

/** True when someone other than `me` has added to the thread since it was last read. */
export function isUnread(thread: FeedbackComment, replies: FeedbackComment[], me: string, seen: Seen): boolean {
  const others = [thread, ...replies].filter((c) => !me || !sameName(c.author, me))
  if (!others.length) return false
  const latest = Math.max(...others.map((c) => time(c.createdAt)))
  return latest > Math.max(seen.baseline, seen.threads[thread.id] ?? 0)
}

/** This browser's record for a project, creating it on first visit with everything so far read. */
export function loadSeen(project: string, comments: FeedbackComment[]): Seen {
  try {
    const saved = JSON.parse(localStorage.getItem(seenKey(project)) ?? 'null') as Seen | null
    if (saved && typeof saved.baseline === 'number') return { baseline: saved.baseline, threads: saved.threads ?? {} }
  } catch {
    // Start afresh below.
  }
  const seen: Seen = { baseline: comments.length ? Math.max(...comments.map((c) => time(c.createdAt))) : Date.now(), threads: {} }
  saveSeen(project, seen)
  return seen
}

export function saveSeen(project: string, seen: Seen): void {
  try {
    localStorage.setItem(seenKey(project), JSON.stringify(seen))
  } catch {
    // Read state lasts until the page reloads.
  }
}

/** Marks threads read up to the given activity times. Returns the updated record, or the same one if nothing changed. */
export function markRead(seen: Seen, upTo: Map<string, number>): Seen {
  let changed = false
  const threads = { ...seen.threads }
  for (const [id, at] of upTo) {
    if ((threads[id] ?? 0) < at) {
      threads[id] = at
      changed = true
    }
  }
  return changed ? { ...seen, threads } : seen
}

/** Unread first, each group by latest activity; or simply by latest activity. */
export function sortThreads<T extends { id: string }>(threads: T[], latest: Map<string, number>, unread: Set<string>, mode: SortMode): T[] {
  return [...threads].sort((a, b) => {
    if (mode === 'unread' && unread.has(a.id) !== unread.has(b.id)) return unread.has(a.id) ? -1 : 1
    return (latest.get(b.id) ?? 0) - (latest.get(a.id) ?? 0)
  })
}

export function loadSort(): SortMode {
  try {
    return localStorage.getItem(SORT_KEY) === 'recent' ? 'recent' : 'unread'
  } catch {
    return 'unread'
  }
}

export function saveSort(mode: SortMode): void {
  try {
    localStorage.setItem(SORT_KEY, mode)
  } catch {
    // The choice lasts until the page reloads.
  }
}
