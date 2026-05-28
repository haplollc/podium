import { describe, it, expect, vi } from 'vitest'
import { render } from 'ink-testing-library'
import React from 'react'
import { Repl } from '../src/Repl.js'

describe('Repl', () => {
  it('renders the prompt and context meter, and submits input to onSubmit', async () => {
    const onSubmit = vi.fn(async () => 'response text')
    const { lastFrame, stdin } = render(
      <Repl
        stats={{ used: 100, effective: 8000, window: 8192, percentUsed: 0.0125 }}
        transcript={[]}
        onSubmit={onSubmit}
        busy={false}
      />,
    )
    expect(lastFrame()).toContain('›') // prompt glyph
    // Ink attaches its stdin handler after the first render commit; wait a tick.
    await new Promise(r => setTimeout(r, 30))
    stdin.write('hello\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('hello'))
  })

  it('shows a command autocomplete dropdown when typing /<prefix>', async () => {
    const { lastFrame, stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={false}
        commands={['model', 'models', 'help']}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('/m')
    await vi.waitFor(() => {
      const f = lastFrame() ?? ''
      expect(f).toContain('/model')
      expect(f).toContain('/models')
      expect(f).not.toContain('/help')
    })
  })

  it('Enter on a /<prefix> runs the highlighted (closest) command', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
        commands={['model', 'models', 'help']}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('/h')                       // opens the menu (closest match: help)
    await new Promise(r => setTimeout(r, 30))
    stdin.write('\r')                        // Enter runs the highlighted command
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('/help'))
  })

  it('renders live streaming text and a status spinner while busy', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={true}
        streaming={'partial answer so far'} status={'Loading model…'}
      />,
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('partial answer so far')
    expect(f).toContain('Loading model…')
  })
})
