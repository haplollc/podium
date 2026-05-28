import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateMessageTokens } from '../src/tokens.js'

describe('token estimator', () => {
  it('estimates ~1 token per 4 chars', () => {
    expect(estimateTokens('a'.repeat(40))).toBe(10)
  })
  it('adds per-message overhead', () => {
    const t = estimateMessageTokens([{ role: 'user', content: 'hello world' }])
    expect(t).toBeGreaterThan(estimateTokens('hello world'))
  })
})
