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
      // '/help' isn't a match for prefix "m"; the banner mentions it, so check the menu lines only.
      const menuLines = f.split('\n').filter(l => /^\s*\/\w/.test(l)).join('\n')
      expect(menuLines).not.toContain('/help')
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

  it('shows a single compact YOLO indicator in the footer (not per-tool spam)', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[{ role: 'tool', text: 'Glob › **/*' }, { role: 'tool', text: 'Bash › ls' }]}
        onSubmit={() => {}} busy={false} yolo planMode
      />,
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('⚠ YOLO')
    expect(f).toContain('PLAN MODE')
    // exactly one YOLO line, regardless of how many tool entries are in the log
    expect((f.match(/⚠ YOLO/g) ?? []).length).toBe(1)
  })

  it('left arrow + typing inserts at the caret (not just at the end)', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('ac')          // "ac"
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\u001B[D')      // left arrow → caret between a and c
    await new Promise(r => setTimeout(r, 20))
    stdin.write('b')           // insert → "abc"
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('abc'))
  })

  it('backspace deletes the character before the caret', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('abc')
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\u001B[D')      // caret between b and c
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\u007F')        // backspace → removes 'b' → "ac"
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('ac'))
  })

  it('trailing backslash + Return inserts a newline instead of submitting', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('a\\')  // "a" then a backslash
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\r')    // Return -> backslash becomes a newline (does not submit)
    await new Promise(r => setTimeout(r, 20))
    stdin.write('b')
    await new Promise(r => setTimeout(r, 20))
    expect(onSubmit).not.toHaveBeenCalled()
    stdin.write('\r')    // plain Return submits
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a\nb'))
  })

  it('Escape immediately before Return also makes a newline', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('a')
    await new Promise(r => setTimeout(r, 20))
    stdin.write('\u001B')  // Escape ...
    stdin.write('\r')      // ... immediately followed by Return -> newline
    await new Promise(r => setTimeout(r, 20))
    stdin.write('b')
    await new Promise(r => setTimeout(r, 20))
    expect(onSubmit).not.toHaveBeenCalled()
    stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('a\nb'))
  })

  it('pasted multi-line text is inserted intact (not submitted on the first newline)', async () => {
    const onSubmit = vi.fn(async () => '')
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('line1\r\nline2\nline3')   // a paste with mixed CRLF/LF
    await new Promise(r => setTimeout(r, 30))
    expect(onSubmit).not.toHaveBeenCalled()
    stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('line1\nline2\nline3'))
  })

  it('renders a long, wrapping input without crashing and keeps the text', async () => {
    const long = 'Howdy can you find my resume in a desktop subfolder and then create a portfolio site from it please'
    const { lastFrame, stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={false}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write(long)
    await vi.waitFor(() => expect((lastFrame() ?? '').replace(/\n/g, ' ')).toContain('portfolio site'))
  })

  it('shows running background tasks (with URL) live in the footer', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={false}
        bgTasks={[
          { id: 1, command: 'python3 -m http.server 8000', startedAt: Date.now() - 5000, status: 'running', output: '', url: 'http://localhost:8000' },
          { id: 2, command: 'old job', startedAt: Date.now(), status: 'exited', exitCode: 0, output: '' },
        ]}
      />,
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('bg #1')
    expect(f).toContain('http://localhost:8000')
    expect(f).not.toContain('bg #2')   // exited tasks aren't shown in the live footer
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

  it('keeps prose with code fences visible while streaming', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={true}
        streaming={'I will write this:\n```ts\nconsole.log(1)\n```'}
      />,
    )
    expect(lastFrame()).toContain('console.log')
  })

  it('hides raw text-emitted tool calls from the live preview', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={true}
        streaming={'{"name":"Write","arguments":{"file_path":"x","content":"y"}}'}
      />,
    )
    expect(lastFrame()).not.toContain('file_path')
  })

  it('keeps working notes in the transcript', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[{ role: 'note', text: 'Hmm, let me check your folders.' }]}
        onSubmit={() => {}} busy={false}
      />,
    )
    expect(lastFrame()).toContain('Hmm, let me check your folders.')
  })

  it('Up arrow recalls the previous prompt from history', async () => {
    const onSubmit = vi.fn(async () => '')
    const { lastFrame, stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} busy={false}
        history={['first prompt', 'second prompt']}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('[A')  // up arrow → most recent
    await vi.waitFor(() => expect(lastFrame()).toContain('second prompt'))
    stdin.write('[A')  // up again → older
    await vi.waitFor(() => expect(lastFrame()).toContain('first prompt'))
    stdin.write('\r')
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith('first prompt'))
  })

  it('queues a message via onQueue when busy, instead of submitting', async () => {
    const onSubmit = vi.fn()
    const onQueue = vi.fn()
    const { stdin } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={onSubmit} onQueue={onQueue} busy={true}
      />,
    )
    await new Promise(r => setTimeout(r, 30))
    stdin.write('queued msg\r')
    await vi.waitFor(() => expect(onQueue).toHaveBeenCalledWith('queued msg'))
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('shows the queued box with pending messages', () => {
    const { lastFrame } = render(
      <Repl
        stats={{ used: 0, effective: 8000, window: 8192, percentUsed: 0 }}
        transcript={[]} onSubmit={() => {}} busy={true}
        queued={['do the next thing', 'then this']}
      />,
    )
    const f = lastFrame() ?? ''
    expect(f).toContain('queued (2)')
    expect(f).toContain('do the next thing')
  })
})
