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
})
