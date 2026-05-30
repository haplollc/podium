import { describe, it, expect } from 'vitest'
import { coerceToolArguments, streamError } from '../src/tool-args.js'

describe('coerceToolArguments', () => {
  it('passes through a real object', () => {
    expect(coerceToolArguments({ file_path: 'a', content: 'x' })).toEqual({ file_path: 'a', content: 'x' })
  })
  it('parses a JSON-string of arguments', () => {
    expect(coerceToolArguments('{"command":"ls"}')).toEqual({ command: 'ls' })
  })
  it('recovers a JSON string with raw (unescaped) newlines in values', () => {
    const out = coerceToolArguments('{"content":"line1\nline2"}')
    expect(String(out.content)).toContain('line1')
    expect(String(out.content)).toContain('line2')
  })
  it('returns {} for empty/whitespace string (not a parse error)', () => {
    expect(coerceToolArguments('   ')).toEqual({})
    expect(coerceToolArguments('')).toEqual({})
  })
  it('flags unparseable strings with __parse_error', () => {
    expect(coerceToolArguments('not json at all')).toEqual({ __parse_error: expect.any(String) })
  })
  it('flags non-object JSON (array/number) with __parse_error', () => {
    expect(coerceToolArguments('[1,2,3]')).toEqual({ __parse_error: expect.any(String) })
    expect(coerceToolArguments(42)).toEqual({ __parse_error: expect.any(String) })
  })
})

describe('streamError', () => {
  it('extracts a string error field', () => {
    expect(streamError({ error: 'model not found' })).toBe('model not found')
  })
  it('extracts a nested error.message', () => {
    expect(streamError({ error: { message: 'bad request' } })).toBe('bad request')
  })
  it('returns undefined for normal payloads', () => {
    expect(streamError({ message: { content: 'hi' } })).toBeUndefined()
    expect(streamError('text')).toBeUndefined()
    expect(streamError(null)).toBeUndefined()
  })
})
