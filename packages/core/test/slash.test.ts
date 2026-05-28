import { describe, it, expect } from 'vitest'
import { parseSlash, isBuiltinSlash } from '../src/slash.js'

describe('parseSlash', () => {
  it('parses a command with args', () => {
    expect(parseSlash('/model gpt-oss:20b')).toEqual({ name: 'model', args: 'gpt-oss:20b' })
  })
  it('parses a bare command', () => {
    expect(parseSlash('/help')).toEqual({ name: 'help', args: '' })
  })
  it('returns null for non-slash input', () => {
    expect(parseSlash('hello there')).toBeNull()
  })
  it('trims surrounding whitespace and multi-word args', () => {
    expect(parseSlash('  /pull   qwen2.5-coder:7b  ')).toEqual({ name: 'pull', args: 'qwen2.5-coder:7b' })
  })
  it('recognizes builtin commands', () => {
    expect(isBuiltinSlash('model')).toBe(true)
    expect(isBuiltinSlash('frobnicate')).toBe(false)
  })
})
