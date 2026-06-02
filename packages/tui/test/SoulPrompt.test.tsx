import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { SoulPrompt } from '../src/SoulPrompt.js'

describe('SoulPrompt', () => {
  it('shows the proposed line and Yes/No options', () => {
    const { lastFrame } = render(<SoulPrompt line="Keep answers short" onDecision={() => {}} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('Keep answers short')
    expect(f).toContain('Yes, remember it')
    expect(f).toContain('No thanks')
  })

  it('Enter confirms (Yes by default)', async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<SoulPrompt line="x" onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 30))
    stdin.write('\r')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith(true))
  })

  it("'n' declines", async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<SoulPrompt line="x" onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('n')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith(false))
  })
})
