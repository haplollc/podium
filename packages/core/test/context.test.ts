import { describe, it, expect } from 'vitest'
import { ContextManager } from '../src/context.js'

describe('ContextManager', () => {
  it('tracks messages and reports stats against the effective window', () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'x'.repeat(4000) }) // ~1000 tokens
    const s = cm.stats()
    expect(s.window).toBe(8192)
    expect(s.effective).toBe(6192)            // 8192 - 2000
    expect(s.used).toBeGreaterThan(900)
    expect(s.percentUsed).toBeCloseTo(s.used / s.effective, 5)
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
