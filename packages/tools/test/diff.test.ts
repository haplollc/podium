import { describe, it, expect } from 'vitest'
import { diffSummary } from '../src/diff.js'

describe('diffSummary', () => {
  it('shows all lines as additions for a new file', () => {
    const d = diffSummary('', 'line1\nline2', 'new.txt')
    expect(d).toContain('new.txt  (+2 -0)')
    expect(d).toContain('+ line1')
    expect(d).toContain('+ line2')
  })
  it('shows changed lines as -/+ for an edit', () => {
    const d = diffSummary('a\nb\nc', 'a\nB\nc', 'f.txt')
    expect(d).toContain('(+1 -1)')
    expect(d).toContain('- b')
    expect(d).toContain('+ B')
    expect(d).not.toContain(' a')   // unchanged context lines are dropped
  })
})
