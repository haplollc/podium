import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { MetricsBar, type MetricsData } from '../src/MetricsBar.js'

const base: MetricsData = {
  model: 'qwen2.5-coder:14b',
  contextStats: { used: 0, effective: 6200, window: 8192, percentUsed: 0 },
  modelMemGB: 9,
  ramUsedGB: 24,
  ramTotalGB: 24,
  tokensPerSec: 31,
  temp: { celsius: 30, source: 'battery', zone: 'green' },
}

describe('MetricsBar', () => {
  it('shows the model, context and ram rows', () => {
    const f = render(<MetricsBar m={base} />).lastFrame() ?? ''
    expect(f).toContain('qwen2.5-coder:14b')
    expect(f).toContain('ctx')
    expect(f).toContain('ram')
    expect(f).toContain('31 tok/s')
    expect(f).toContain('30°C')
  })

  it('uses a horizontal rule, not a rounded box with side edges', () => {
    const f = render(<MetricsBar m={base} />).lastFrame() ?? ''
    // No rounded-box corner glyphs and no vertical side edges.
    for (const glyph of ['╭', '╮', '╰', '╯', '│']) expect(f).not.toContain(glyph)
    expect(f).toContain('─') // the top rule
  })
})
