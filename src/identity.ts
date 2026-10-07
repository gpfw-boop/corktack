/*
 * The reviewer's name, remembered so they only type it once. Falls back to
 * memory when localStorage is unavailable.
 */

const NAME_KEY = 'corktack:reviewer'

let memory: string | null = null

export const reviewerName = {
  get(): string {
    try {
      return localStorage.getItem(NAME_KEY) ?? ''
    } catch {
      return memory ?? ''
    }
  },
  set(name: string): void {
    try {
      localStorage.setItem(NAME_KEY, name)
    } catch {
      memory = name
    }
  },
}
