import { describe, it, expect } from 'vitest'
import { parseSlash } from '@podium/core'

// Mirrors drainQueue grouping: consecutive plain msgs combine; slashes split out.
function group(items: string[]): string[] {
  const groups: string[] = []
  let buf: string[] = []
  for (const it of items) {
    if (parseSlash(it)) { if (buf.length) { groups.push(buf.join('\n\n')); buf = [] } groups.push(it) }
    else buf.push(it)
  }
  if (buf.length) groups.push(buf.join('\n\n'))
  return groups
}

describe('queue grouping', () => {
  it('combines consecutive plain messages and isolates slash commands in order', () => {
    expect(group(['fix the bug', 'add a test', '/clear', 'now refactor'])).toEqual([
      'fix the bug\n\nadd a test',
      '/clear',
      'now refactor',
    ])
  })
  it('a lone slash command stays standalone', () => {
    expect(group(['/model'])).toEqual(['/model'])
  })
})
