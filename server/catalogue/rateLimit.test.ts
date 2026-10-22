// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { rateLimiter } from './rateLimit'

describe('rateLimiter', () => {
  it('allows up to the limit, then reports seconds until the window resets', () => {
    let t = 0
    const check = rateLimiter(2, 60_000, () => t)
    expect(check('a')).toBe(0)
    expect(check('a')).toBe(0)
    t = 10_000
    expect(check('a')).toBe(50)
  })
  it('counts clients separately and starts a fresh window after expiry', () => {
    let t = 0
    const check = rateLimiter(1, 60_000, () => t)
    expect(check('a')).toBe(0)
    expect(check('b')).toBe(0)
    expect(check('a')).toBeGreaterThan(0)
    t = 60_000
    expect(check('a')).toBe(0)
  })
})
