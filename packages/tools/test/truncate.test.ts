import { describe, it, expect } from 'vitest'
import { truncateLines } from '../src/truncate.js'

describe('truncateLines', () => {
  it('caps output and appends a remaining-lines marker', () => {
    const text = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    const out = truncateLines(text, 10)
    expect(out.split('\n').length).toBeLessThanOrEqual(11) // 10 + marker
    expect(out).toContain('90 more lines')
  })
  it('returns input unchanged when under the cap', () => {
    expect(truncateLines('a\nb', 10)).toBe('a\nb')
  })
  it('clips one pathologically long line (minified/base64) instead of keeping it whole', () => {
    const long = 'x'.repeat(50_000)
    const out = truncateLines(`ok\n${long}\nalso ok`, 10)
    expect(out.length).toBeLessThan(2000)
    expect(out).toContain('[line truncated]')
    expect(out).toContain('also ok')
  })
  it('applies a total-character backstop across many max-length lines', () => {
    const text = Array.from({ length: 200 }, () => 'y'.repeat(400)).join('\n')
    const out = truncateLines(text, 200)
    expect(out.length).toBeLessThan(31_000)
    expect(out).toContain('(output truncated)')
  })
})
