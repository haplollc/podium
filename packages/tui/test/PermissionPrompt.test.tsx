import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { PermissionPrompt } from '../src/PermissionPrompt.js'

const call = { id: '1', name: 'Bash', arguments: { command: 'echo hi' } }

describe('PermissionPrompt', () => {
  it('shows Yes/Always/No options and a compact label', () => {
    const { lastFrame } = render(<PermissionPrompt call={call} onDecision={() => {}} />)
    const f = lastFrame() ?? ''
    expect(f).toContain('Yes, run it')
    expect(f).toContain('Always (this session)')
    expect(f).toContain('No, skip it')
    expect(f).toContain('Bash › echo hi')
  })
  it('Enter selects the highlighted option (Yes by default)', async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<PermissionPrompt call={call} onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 30))
    stdin.write('\r')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith('yes'))
  })
  it('right arrow then Enter selects Always', async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<PermissionPrompt call={call} onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('[C')   // right arrow (ANSI) → Always
    await new Promise(r => setTimeout(r, 60))
    stdin.write('\r')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith('always'))
  })

  it("'n' key denies directly", async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<PermissionPrompt call={call} onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('n')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith('no'))
  })

  it("'a' key chooses always directly", async () => {
    const onDecision = vi.fn()
    const { stdin } = render(<PermissionPrompt call={call} onDecision={onDecision} />)
    await new Promise(r => setTimeout(r, 40))
    stdin.write('a')
    await vi.waitFor(() => expect(onDecision).toHaveBeenCalledWith('always'))
  })
})
