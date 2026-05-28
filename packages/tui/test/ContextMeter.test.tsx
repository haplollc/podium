import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { ContextMeter } from '../src/ContextMeter.js'

describe('ContextMeter', () => {
  it('renders percent and token counts', () => {
    const { lastFrame } = render(
      <ContextMeter stats={{ used: 4900, effective: 8000, window: 8192, percentUsed: 0.6125 }} />,
    )
    const frame = lastFrame() ?? ''
    expect(frame).toContain('61%')
    expect(frame).toContain('4.9k')
  })
})
