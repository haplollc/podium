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
})
