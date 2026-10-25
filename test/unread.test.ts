// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import type { FeedbackComment } from '../src/types'
import { isUnread, latestActivity, loadSeen, markRead, sortThreads } from '../src/unread'

const at = (minute: number) => new Date(Date.UTC(2026, 9, 26, 9, minute)).toISOString()
const comment = (id: string, author: string, minute: number, parentId: string | null = null): FeedbackComment => ({
  id, project: 'demo', parentId, route: '/', author, body: 'Hi', anchor: null,
  viewportWidth: null, createdAt: at(minute), resolvedAt: null, view: null,
})

beforeEach(() => localStorage.clear())

describe('unread threads', () => {
  it('counts everything already there as read on a first visit', () => {
    const seen = loadSeen('demo', [comment('a', 'Priya', 5), comment('b', 'Sam', 10)])
    expect(isUnread(comment('b', 'Sam', 10), [], 'Gil', seen)).toBe(false)
    expect(isUnread(comment('c', 'Sam', 11), [], 'Gil', seen)).toBe(true)
  })

  it('ignores your own comments and replies, by name', () => {
    const seen = loadSeen('demo', [comment('a', 'Priya', 5)])
    const thread = comment('a', 'Priya', 5)
    expect(isUnread(thread, [comment('r', ' gil ', 20, 'a')], 'Gil', seen)).toBe(false)
    expect(isUnread(thread, [comment('r', 'Sam', 20, 'a')], 'Gil', seen)).toBe(true)
  })

  it('is read once opened, until someone else replies', () => {
    let seen = loadSeen('demo', [])
    const thread = comment('a', 'Priya', 30)
    seen = { ...seen, baseline: 0 }
    expect(isUnread(thread, [], 'Gil', seen)).toBe(true)
    seen = markRead(seen, new Map([['a', latestActivity(thread, [])]]))
    expect(isUnread(thread, [], 'Gil', seen)).toBe(false)
    expect(isUnread(thread, [comment('r', 'Sam', 31, 'a')], 'Gil', seen)).toBe(true)
  })

  it('remembers the record for the project', () => {
    loadSeen('demo', [comment('a', 'Priya', 5)])
    expect(loadSeen('demo', []).baseline).toBe(Date.parse(at(5)))
  })
})

describe('sortThreads', () => {
  const threads = [{ id: 'old-unread' }, { id: 'new-read' }, { id: 'mid-unread' }]
  const latest = new Map([['old-unread', 1], ['new-read', 3], ['mid-unread', 2]])
  const unread = new Set(['old-unread', 'mid-unread'])

  it('puts unread first, each group newest first', () => {
    expect(sortThreads(threads, latest, unread, 'unread').map((t) => t.id)).toEqual(['mid-unread', 'old-unread', 'new-read'])
  })

  it('or simply by latest activity', () => {
    expect(sortThreads(threads, latest, unread, 'recent').map((t) => t.id)).toEqual(['new-read', 'mid-unread', 'old-unread'])
  })
})
