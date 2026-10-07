import { describe, expect, it } from 'vitest'
import { avatarColour, initials, timeAgo } from '../src/util'

describe('initials', () => {
  it('uses the first and last names', () => {
    expect(initials('Priya Sharma')).toBe('PS')
    expect(initials('  mary  jane   watson ')).toBe('MW')
    expect(initials('sam')).toBe('S')
    expect(initials('Ōtani Shōhei')).toBe('ŌS')
    expect(initials('')).toBe('?')
  })
})

describe('avatarColour', () => {
  it('gives the same name the same colour, ignoring case and spacing', () => {
    expect(avatarColour('Priya Sharma')).toBe(avatarColour(' priya  sharma '))
    expect(avatarColour('Priya Sharma')).toMatch(/^#[0-9A-F]{6}$/)
  })

  it('spreads names across the palette', () => {
    const names = ['Priya', 'Sam', 'Jordan', 'Riley', 'Alex', 'Kim', 'Lee', 'Max', 'Noor', 'Tom', 'Ana', 'Ben']
    expect(new Set(names.map(avatarColour)).size).toBeGreaterThanOrEqual(5)
  })
})

describe('timeAgo', () => {
  const now = Date.parse('2026-10-07T12:00:00Z')
  const ago = (mins: number) => new Date(now - mins * 60_000).toISOString()
  it('reads naturally', () => {
    expect(timeAgo(ago(0.2), now)).toBe('Just now')
    expect(timeAgo(ago(5), now)).toBe('5 minutes ago')
    expect(timeAgo(ago(180), now)).toBe('3 hours ago')
    expect(timeAgo(ago(60 * 24), now)).toBe('yesterday')
    expect(timeAgo(ago(60 * 24 * 3), now)).toBe('3 days ago')
    expect(timeAgo(ago(60 * 24 * 30), now)).toBe('7 Sept')
  })
})
