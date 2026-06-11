import { describe, it, expect } from 'vitest'
import { ContextManager } from '../src/context.js'
import { tokenizerReady } from '../src/tokens.js'

describe('ContextManager', () => {
  it('tracks messages and reports stats against the effective window', async () => {
    await tokenizerReady   // deterministic counts (real BPE, not the fallback)
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'some ordinary words repeated over and over. '.repeat(100) })
    const s = cm.stats()
    expect(s.window).toBe(8192)
    expect(s.effective).toBe(6192)            // 8192 - 2000
    expect(s.used).toBeGreaterThan(500)       // ~9 tokens × 100 reps
    expect(s.percentUsed).toBeCloseTo(s.used / s.effective, 5)
  })

  it('length and truncateTo support /rewind to an earlier message', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'first' })
    cm.add({ role: 'assistant', content: 'reply one' })
    const mark = cm.length()                    // rewind point = before the 2nd turn
    cm.add({ role: 'user', content: 'second' })
    cm.add({ role: 'assistant', content: 'reply two' })
    expect(cm.length()).toBe(4)
    cm.truncateTo(mark)
    expect(cm.length()).toBe(2)
    expect(cm.messages().map(m => m.content)).toEqual(['first', 'reply one'])
  })

  it('truncateTo clamps out-of-range indices', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'a' })
    cm.truncateTo(-5)
    expect(cm.length()).toBe(0)
    cm.add({ role: 'user', content: 'b' })
    cm.truncateTo(99)                           // beyond end → no-op
    expect(cm.length()).toBe(1)
  })

  it('replaceWithSummary swaps the message list for a summary message', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'a'.repeat(8000) })
    cm.add({ role: 'assistant', content: 'b'.repeat(8000) })
    const before = cm.stats().used
    cm.replaceWithSummary('short summary', 1) // keep first 1 message as prefix
    expect(cm.messages().length).toBe(2)      // retained prefix + summary
    expect(cm.stats().used).toBeLessThan(before)
  })
})
