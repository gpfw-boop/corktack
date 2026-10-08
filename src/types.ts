/** Where a comment is attached, with layered fallbacks so pins survive rebuilds. */
export interface Anchor {
  /** CSS selector for the target element. */
  selector: string
  /** How the selector was built: from a stable hook, a hook plus a structural path, or a path alone. */
  strategy: 'hook' | 'hook+path' | 'path'
  /** Lowercase tag name, used by the text fallback. */
  tag: string
  /** Click position inside the element, as a fraction of its width and height (0 to 1). */
  xPct: number
  yPct: number
  /** Start of the element's text, used to re-find it if the selector breaks. */
  text?: string
  /** Document coordinates at the time of the click. Informational only. */
  pageX: number
  pageY: number
}

/**
 * How to get back to what the commenter was looking at: the full address,
 * then the clicks that revealed the pinned element (opening a drawer, a tab
 * or an accordion), oldest first. Each step is where the click landed.
 */
export interface CommentView {
  /** Path, query and hash, without Corktack's own parameters. */
  url: string
  steps: Anchor[]
}

/**
 * A top-level comment or a reply. Top-level comments have an anchor and no
 * parent; replies have a parent and no anchor. Only one level of replies.
 */
export interface FeedbackComment {
  id: string
  project: string
  /** Null for top-level comments. */
  parentId: string | null
  /** Route the comment was left on (pathname, plus hash for hash routers). */
  route: string
  author: string
  body: string
  /** Null for replies. */
  anchor: Anchor | null
  /** Viewport width when the comment was left, in px. Null for replies. */
  viewportWidth: number | null
  /** How to reopen the view the comment was left in. Null for replies and older comments. */
  view: CommentView | null
  createdAt: string
  /** When the thread was marked done, or null while it's open. Always null for replies. */
  resolvedAt: string | null
}

/** What the widget sends to an adapter. The adapter assigns `id`, `createdAt` and `resolvedAt`. */
export type NewComment = Omit<FeedbackComment, 'id' | 'createdAt' | 'resolvedAt'>

/**
 * Where comments live. Implement this to use any backend without changing the
 * UI. `subscribe` is optional: without it, comments from others appear on the
 * next page load.
 */
export interface StorageAdapter {
  list(project: string): Promise<FeedbackComment[]>
  create(comment: NewComment): Promise<FeedbackComment>
  /** Deletes a comment, and its replies when it's a top-level comment. Anyone can delete any comment. */
  remove(id: string): Promise<void>
  /** Marks a top-level comment resolved, or opens it again. */
  setResolved(id: string, resolved: boolean): Promise<void>
  /** Calls `onChange` whenever comments for the project change. Returns an unsubscribe function. */
  subscribe?(project: string, onChange: () => void): () => void
}

/** One task in a study. */
export interface StudyTask {
  /** Short and plain, e.g. "Find next week's roster". */
  title: string
  /** What to do, in the participant's words. Shown alongside the prototype for the whole task. */
  instructions?: string
  /** Address to go to when the task starts, e.g. "/". Leave out to start wherever they are. */
  start?: string
  /**
   * Finishes the task by itself when reached. `url` matches the path, plus the
   * query if given. `press` is the value of a `data-feedback` hook to press.
   * Without a goal, the participant presses Done.
   */
  goal?: { url?: string; press?: string }
}

/** A set of tasks to take someone through, opened with ?study=<id>. */
export interface Study {
  title: string
  /** A line or two before the first task. */
  intro?: string
  tasks: StudyTask[]
}

export interface FeedbackOptions {
  /** Identifies the prototype, so several prototypes on one backend stay separate. Defaults to location.host. */
  project?: string
  /** Query parameter that switches feedback on. Defaults to "feedback". */
  param?: string
  /** Where comments are stored. Defaults to `localAdapter()`, which keeps them in this browser only. */
  adapter?: StorageAdapter
  /** Attribute you can add to elements to give pins a stable anchor. Defaults to "data-feedback". */
  hookAttribute?: string
  /** How to derive the current route. Defaults to pathname, plus the hash when it looks like a hash route. */
  getRoute?: () => string
  /** Show the hidden tab at the bottom of the page that turns comments on. Defaults to true. */
  launcher?: boolean
  /**
   * Studies to take participants through, keyed by id. Open one with
   * ?study=<id>; comments stay off for the whole study. ?study=off ends it.
   */
  studies?: Record<string, Study>
}
