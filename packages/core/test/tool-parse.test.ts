import { describe, it, expect } from 'vitest'
import { extractToolCalls } from '../src/tool-parse.js'

const KNOWN = ['Write', 'Read', 'Bash']

describe('extractToolCalls', () => {
  it('parses a bare JSON tool call', () => {
    const text = '{"name":"Write","arguments":{"file_path":"hello.txt","content":"maestro"}}'
    const { calls, cleanedText } = extractToolCalls(text, KNOWN)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('Write')
    expect(calls[0].arguments).toEqual({ file_path: 'hello.txt', content: 'maestro' })
    expect(cleanedText).toBe('')
  })

  it('parses a multiline / fenced tool call and keeps surrounding prose', () => {
    const text = 'Sure, I will do that.\n```json\n{\n "name": "Read",\n "arguments": { "file_path": "/x" }\n}\n```\nDone.'
    const { calls, cleanedText } = extractToolCalls(text, KNOWN)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('Read')
    expect(cleanedText).toContain('Sure, I will do that.')
    expect(cleanedText).toContain('Done.')
    expect(cleanedText).not.toContain('Read')
  })

  it('handles double-encoded arguments strings', () => {
    const text = '{"name":"Bash","arguments":"{\\"command\\":\\"ls\\"}"}'
    const { calls } = extractToolCalls(text, KNOWN)
    expect(calls[0].arguments).toEqual({ command: 'ls' })
  })

  it('ignores JSON objects whose name is not a known tool', () => {
    const text = '{"name":"NotATool","arguments":{}}'
    expect(extractToolCalls(text, KNOWN).calls).toHaveLength(0)
  })

  it('returns no calls for ordinary prose', () => {
    const text = 'The file already contains the word maestro, so we are done.'
    const r = extractToolCalls(text, KNOWN)
    expect(r.calls).toHaveLength(0)
    expect(r.cleanedText).toBe(text)
  })

  it('parses multiple tool calls in one message', () => {
    const text = '{"name":"Read","arguments":{"file_path":"a"}} then {"name":"Read","arguments":{"file_path":"b"}}'
    const { calls } = extractToolCalls(text, KNOWN)
    expect(calls.map(c => c.arguments.file_path)).toEqual(['a', 'b'])
  })
})
