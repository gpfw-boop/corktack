export const uid = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const normalise = (s: string | null | undefined): string =>
  (s ?? '').replace(/\s+/g, ' ').trim()

export const defaultRoute = (): string => {
  const { pathname, hash } = window.location
  return hash.startsWith('#/') ? pathname + hash : pathname
}

/** Hex SHA-256 of a delete token. Matches `encode(digest(token, 'sha256'), 'hex')` in Postgres. */
export async function hashToken(token: string): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('')
}

/** Avatar colours. All hold white initials at 4.5:1 or better. */
const AVATAR_COLOURS = ['#C2410C', '#B91C1C', '#A21CAF', '#6D28D9', '#1D4ED8', '#0E7490', '#047857', '#4D7C0F']

/** A stable colour for a name, so each person keeps theirs across sessions and browsers. */
export function avatarColour(name: string): string {
  let hash = 0
  for (const ch of normalise(name).toLowerCase()) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return AVATAR_COLOURS[hash % AVATAR_COLOURS.length]
}

/** Up to two initials: "Priya Sharma" → "PS", "sam" → "S". */
export function initials(name: string): string {
  const words = normalise(name).split(' ').filter(Boolean)
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  return letters.map((w) => Array.from(w)[0]).join('').toUpperCase() || '?'
}

const dateFmt = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'short' })
const relative = new Intl.RelativeTimeFormat('en-AU', { numeric: 'auto' })

/** "Just now", "5 minutes ago", "yesterday", then a date after a week. */
export function timeAgo(iso: string, now = Date.now()): string {
  const minutes = (now - Date.parse(iso)) / 60_000
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return relative.format(-Math.round(minutes), 'minute')
  const hours = minutes / 60
  if (hours < 24) return relative.format(-Math.round(hours), 'hour')
  const days = hours / 24
  if (days < 7) return relative.format(-Math.round(days), 'day')
  return dateFmt.format(new Date(iso))
}

export const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Registers a custom element once, so loading the widget twice doesn't throw. */
export function define(tag: string, element: CustomElementConstructor): void {
  if (!customElements.get(tag)) customElements.define(tag, element)
}
