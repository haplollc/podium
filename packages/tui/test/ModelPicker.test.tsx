import { describe, it, expect } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { ModelPicker } from '../src/ModelPicker.js'

const rows = [
  { id: 'qwen2.5-coder:7b', label: 'Qwen2.5-Coder 7B', verdict: 'fits' as const, sizeGB: 4.7, installed: true, tools: true },
  { id: 'qwen3-coder:30b', label: 'Qwen3-Coder 30B', verdict: 'wont-run' as const, sizeGB: 18, installed: false, tools: true },
]

describe('ModelPicker', () => {
  it('renders fit verdicts and an installed marker', () => {
    const { lastFrame } = render(<ModelPicker rows={rows} onSelect={() => {}} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('Qwen2.5-Coder 7B')
    expect(f.toLowerCase()).toContain('installed')
  })
})
