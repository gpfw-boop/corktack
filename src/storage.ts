import type { FeedbackComment, NewComment, StorageAdapter } from './types'
import { uid } from './util'

const PREFIX = 'corktack:comments:'

const read = (project: string): FeedbackComment[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + project) ?? '[]')
    // Comments saved before resolving existed have no resolvedAt.
    return Array.isArray(parsed) ? parsed.map((c) => ({ resolvedAt: null, ...c })) : []
  } catch {
    return []
  }
}

const write = (project: string, comments: FeedbackComment[]): void => {
  try {
    localStorage.setItem(PREFIX + project, JSON.stringify(comments))
  } catch (e) {
    console.warn('[corktack] Could not save comments to localStorage', e)
  }
}

/** Finds the project holding a comment. The id alone doesn't say which one it's in. */
const projectOf = (id: string): string | null => {
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFIX) && read(key.slice(PREFIX.length)).some((c) => c.id === id)) return key.slice(PREFIX.length)
  }
  return null
}

/**
 * Keeps comments in this browser's localStorage. Good for trying Corktack
 * solo with no backend. Other tabs in the same browser update live.
 */
export function localAdapter(): StorageAdapter {
  return {
    async list(project) {
      return read(project)
    },

    async create(input: NewComment) {
      const comment: FeedbackComment = { ...input, id: uid(), createdAt: new Date().toISOString(), resolvedAt: null }
      write(input.project, [...read(input.project), comment])
      return comment
    },

    async remove(id) {
      const project = projectOf(id)
      if (project) write(project, read(project).filter((c) => c.id !== id && c.parentId !== id))
    },

    async setResolved(id, resolved) {
      const project = projectOf(id)
      if (!project) return
      const now = new Date().toISOString()
      write(project, read(project).map((c) =>
        c.id === id && c.parentId === null ? { ...c, resolvedAt: resolved ? (c.resolvedAt ?? now) : null } : c,
      ))
    },

    subscribe(project, onChange) {
      const handler = (e: StorageEvent) => {
        if (e.key === PREFIX + project) onChange()
      }
      window.addEventListener('storage', handler)
      return () => window.removeEventListener('storage', handler)
    },
  }
}
