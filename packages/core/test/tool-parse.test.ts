import { describe, it, expect } from 'vitest'
import { extractToolCalls, cleanModelText, stripSpecialTokens } from '../src/tool-parse.js'

const KNOWN = ['Write', 'Read', 'Bash']

describe('stripSpecialTokens', () => {
  it('removes leaked chat-template tokens', () => {
    expect(stripSpecialTokens('hello <|im_start|>assistant world <|im_end|>')).toBe('hello assistant world ')
    expect(stripSpecialTokens('done<|eot_id|>')).toBe('done')
  })
})

describe('cleanModelText', () => {
  it('strips empty/leftover code fences and trims', () => {
    expect(cleanModelText('```json\n\n```')).toBe('')
    expect(cleanModelText('Here you go:\n```json\n```\n')).toBe('Here you go:')
    expect(cleanModelText('All set.')).toBe('All set.')
  })
  it('leaves a real fenced code block alone', () => {
    expect(cleanModelText('```py\nprint("hi")\n```')).toContain('print("hi")')
  })
})

describe('extractToolCalls', () => {
  it('parses a bare JSON tool call', () => {
    const text = '{"name":"Write","arguments":{"file_path":"hello.txt","content":"podium"}}'
    const { calls, cleanedText } = extractToolCalls(text, KNOWN)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('Write')
    expect(calls[0].arguments).toEqual({ file_path: 'hello.txt', content: 'podium' })
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
    const text = 'The file already contains the word podium, so we are done.'
    const r = extractToolCalls(text, KNOWN)
    expect(r.calls).toHaveLength(0)
    expect(r.cleanedText).toBe(text)
  })

  it('recovers a Write whose content has LITERAL newlines (invalid strict JSON)', () => {
    // Small models often emit multi-line code content with raw newlines, which
    // strict JSON.parse rejects — the Write must not be dropped.
    const text = '{"name":"Write","arguments":{"file_path":"todo.py","content":"import json\nprint(1)\n"}}'
    const { calls } = extractToolCalls(text, KNOWN)
    expect(calls).toHaveLength(1)
    expect(calls[0].name).toBe('Write')
    expect(String(calls[0].arguments.content)).toContain('print(1)')
  })

  it('still extracts the Write when followed by Bash calls (multi-line content)', () => {
    const text =
      '{"name":"Write","arguments":{"file_path":"todo.py","content":"def f():\n    return {\\"a\\": 1}\n"}}\n' +
      '{"name":"Bash","arguments":{"command":"python3 todo.py"}}'
    const { calls } = extractToolCalls(text, KNOWN)
    expect(calls.map(c => c.name)).toEqual(['Write', 'Bash'])
  })

  it('parses multiple tool calls in one message', () => {
    const text = '{"name":"Read","arguments":{"file_path":"a"}} then {"name":"Read","arguments":{"file_path":"b"}}'
    const { calls } = extractToolCalls(text, KNOWN)
    expect(calls.map(c => c.arguments.file_path)).toEqual(['a', 'b'])
  })
})
