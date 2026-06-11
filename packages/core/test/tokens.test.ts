import { describe, it, expect } from 'vitest'
import { estimateTokens, estimateMessageTokens, tokenizerReady } from '../src/tokens.js'

describe('token estimator', () => {
  it('uses real BPE counts once the tokenizer is loaded', async () => {
    expect(await tokenizerReady).toBe(true)
    expect(estimateTokens('hello world')).toBe(2)          // cl100k: ["hello", " world"]
    // Repeated chars compress under BPE — far fewer than chars/4 would claim.
    expect(estimateTokens('x'.repeat(4000))).toBeLessThan(1000)
  })
  it('counts code higher than the old chars/4 heuristic (the unsafe direction)', async () => {
    await tokenizerReady
    const code = 'function add(a, b) { return a + b }'
    expect(estimateTokens(code)).toBeGreaterThan(Math.ceil(code.length / 4))
  })
  it('adds per-message overhead', async () => {
    await tokenizerReady
    const t = estimateMessageTokens([{ role: 'user', content: 'hello world' }])
    expect(t).toBeGreaterThan(estimateTokens('hello world'))
  })
  it('counts tool calls toward the total', async () => {
    await tokenizerReady
    const plain = estimateMessageTokens([{ role: 'assistant', content: 'ok' }])
    const withCall = estimateMessageTokens([{
      role: 'assistant', content: 'ok',
      tool_calls: [{ id: '1', name: 'Read', arguments: { file_path: '/tmp/file.txt' } }],
    }])
    expect(withCall).toBeGreaterThan(plain)
  })
})
