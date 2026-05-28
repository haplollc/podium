import { describe, it, expect, vi } from 'vitest'
import { shouldCompact, compact, SUMMARY_PROMPT } from '../src/compaction.js'
import { ContextManager } from '../src/context.js'

describe('compaction', () => {
  it('shouldCompact is true once used crosses effective - buffer', () => {
    expect(shouldCompact({ used: 5000, effective: 6000, window: 8192, percentUsed: 0.83 }, 1500)).toBe(true)
    expect(shouldCompact({ used: 3000, effective: 6000, window: 8192, percentUsed: 0.5 }, 1500)).toBe(false)
  })

  it('compact() summarizes the tail and shrinks context', async () => {
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'task: build X' })
    cm.add({ role: 'assistant', content: 'z'.repeat(12000) })
    cm.add({ role: 'user', content: 'w'.repeat(12000) })
    const before = cm.stats().used
    const fakeSummarize = vi.fn(async () => 'SUMMARY: building X, did stuff')
    await compact(cm, { summarize: fakeSummarize, prefixCount: 1 })
    expect(fakeSummarize).toHaveBeenCalledOnce()
    // The prompt passed to summarize includes the summary instruction.
    expect(fakeSummarize.mock.calls[0][0]).toContain(SUMMARY_PROMPT.slice(0, 20))
    expect(cm.stats().used).toBeLessThan(before)
  })
})
