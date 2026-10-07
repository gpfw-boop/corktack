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
  createdAt: string
}

/** What the widget sends to an adapter. The adapter assigns `id` and `createdAt`. */
export interface NewComment extends Omit<FeedbackComment, 'id' | 'createdAt'> {
  /** Random per-browser token. Adapters store only its hash, and require it to delete. */
  deleteToken: string
}

/**
 * Where comments live. Implement this to use any backend without changing the
 * UI. `subscribe` is optional: without it, comments from others appear on the
 * next page load.
 */
export interface StorageAdapter {
  list(project: string): Promise<FeedbackComment[]>
  create(comment: NewComment): Promise<FeedbackComment>
  /** Deletes a comment (and its replies) if the token matches the one it was created with. */
  remove(id: string, deleteToken: string): Promise<void>
  /** Calls `onChange` whenever comments for the project change. Returns an unsubscribe function. */
  subscribe?(project: string, onChange: () => void): () => void
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
}
