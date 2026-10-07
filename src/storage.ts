import type { FeedbackComment, NewComment, StorageAdapter } from './types'
import { hashToken, uid } from './util'

interface StoredComment extends FeedbackComment {
  deleteTokenHash: string
}

const PREFIX = 'corktack:comments:'

const read = (project: string): StoredComment[] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PREFIX + project) ?? '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (project: string, comments: StoredComment[]): void => {
  try {
    localStorage.setItem(PREFIX + project, JSON.stringify(comments))
  } catch (e) {
    console.warn('[corktack] Could not save comments to localStorage', e)
  }
}

const strip = ({ deleteTokenHash: _, ...comment }: StoredComment): FeedbackComment => comment

/**
 * Keeps comments in this browser's localStorage. Good for trying Corktack
 * solo with no backend. Other tabs in the same browser update live.
 */
export function localAdapter(): StorageAdapter {
  return {
    async list(project) {
      return read(project).map(strip)
    },

    async create({ deleteToken, ...input }: NewComment) {
      const stored: StoredComment = {
        ...input,
        id: uid(),
        createdAt: new Date().toISOString(),
        deleteTokenHash: await hashToken(deleteToken),
      }
      write(input.project, [...read(input.project), stored])
      return strip(stored)
    },

    async remove(id, deleteToken) {
      const hash = await hashToken(deleteToken)
      // The id alone doesn't say which project it's in, so look through them all.
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i)
        if (!key?.startsWith(PREFIX)) continue
        const project = key.slice(PREFIX.length)
        const comments = read(project)
        const target = comments.find((c) => c.id === id)
        if (!target) continue
        if (target.deleteTokenHash !== hash) throw new Error('You can only delete your own comments.')
        write(project, comments.filter((c) => c.id !== id && c.parentId !== id))
        return
      }
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
