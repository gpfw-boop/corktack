import { uid } from './util'

/*
 * What this browser knows about its reviewer: their name, a random token
 * that proves which comments they left, and the ids of those comments (the
 * token's hash is never sent back, so ownership is remembered locally).
 * Everything falls back to memory when localStorage is unavailable.
 */

const NAME_KEY = 'corktack:reviewer'
const TOKEN_KEY = 'corktack:token'
const OWN_KEY = 'corktack:own'

const memory = new Map<string, string>()

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return memory.get(key) ?? null
  }
}

const write = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value)
  } catch {
    memory.set(key, value)
  }
}

export const reviewerName = {
  get: (): string => read(NAME_KEY) ?? '',
  set: (name: string): void => write(NAME_KEY, name),
}

/** This browser's delete token, created on first use. */
export function deleteToken(): string {
  let token = read(TOKEN_KEY)
  if (!token) {
    token = uid() + uid()
    write(TOKEN_KEY, token)
  }
  return token
}

const ownIds = (): Set<string> => {
  try {
    return new Set(JSON.parse(read(OWN_KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export const ownership = {
  has: (id: string): boolean => ownIds().has(id),
  add(id: string): void {
    const ids = ownIds()
    ids.add(id)
    write(OWN_KEY, JSON.stringify([...ids]))
  },
}
