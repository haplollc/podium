import { describe, it, expect } from 'vitest'
import { groupQueuedInputs } from '../src/queue.js'

describe('queue grouping', () => {
  it('combines consecutive plain messages and isolates slash commands in order', () => {
    expect(groupQueuedInputs(['fix the bug', 'add a test', '/clear', 'now refactor'])).toEqual([
      'fix the bug\n\nadd a test',
      '/clear',
      'now refactor',
    ])
  })
  it('a lone slash command stays standalone', () => {
    expect(groupQueuedInputs(['/model'])).toEqual(['/model'])
  })
})

describe('queue grouping edge cases', () => {
  it('all-plain stays a single combined turn', () => {
    expect(groupQueuedInputs(['a', 'b', 'c'])).toEqual(['a\n\nb\n\nc'])
  })
  it('all-slash each runs individually in order', () => {
    expect(groupQueuedInputs(['/clear', '/help', '/model'])).toEqual(['/clear', '/help', '/model'])
  })
  it('empty queue yields nothing', () => {
    expect(groupQueuedInputs([])).toEqual([])
  })
})
