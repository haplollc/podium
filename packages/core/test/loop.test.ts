import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../src/system-prompt.js'
import { runTurn } from '../src/loop.js'
import { ContextManager } from '../src/context.js'
import type { Provider, ChatEvent } from '@podium/providers'
import type { Tool } from '@podium/tools'

describe('buildSystemPrompt', () => {
  it('is compact (<1200 tokens worth of chars) and includes cwd + tool discipline', () => {
    const p = buildSystemPrompt({ cwd: '/work/proj', os: 'darwin', toolNames: ['Read', 'Edit', 'Bash'] })
    expect(p).toContain('/work/proj')
    expect(p.toLowerCase()).toContain('read')
    expect(p.length).toBeLessThan(4800) // ~1200 tokens at 4 chars/token
  })

  it('lists the provided tool names', () => {
    const p = buildSystemPrompt({ cwd: '/p', os: 'darwin', toolNames: ['Read', 'Write', 'Bash'] })
    expect(p).toContain('Read, Write, Bash')
  })

  it('stays lean — no contradictory ALL-CAPS nudge blocks in the global prompt', () => {
    const p = buildSystemPrompt({ cwd: '/p', os: 'darwin', toolNames: ['Read', 'WebSearch', 'Bash', 'TodoWrite'] })
    // Caveats now live in tool descriptions, not the system prompt.
    expect(p).not.toContain('NEVER')
    expect(p).not.toContain('CRITICAL')
    expect(p.length).toBeLessThan(2400)
  })

  it('includes optional memory, skill listing, and plan-mode sections', () => {
    const p = buildSystemPrompt({
      cwd: '/p', os: 'darwin', toolNames: ['Read'],
      memory: 'Use tabs not spaces.', skillListing: '- commit: make a commit', planMode: true,
    })
    expect(p).toContain('PLAN MODE')
    expect(p).toContain('Use tabs not spaces.')
    expect(p).toContain('- commit: make a commit')
  })
})

function fakeProvider(scripts: ChatEvent[][]): Provider {
  let turn = 0
  return {
    id: 'ollama',
    health: async () => ({ running: true }),
    listLocal: async () => [],
    pull: async () => {},
    capabilities: async () => ({ tools: true }),
    async *chat() { for (const e of scripts[turn++] ?? []) yield e },
  }
}

const echoTool = (calls: string[]): Tool => ({
  schema: { name: 'Echo', description: 'echo', parameters: { type: 'object', properties: {} } },
  run: async (a) => { calls.push(String(a.value)); return `echoed ${a.value}` },
})

describe('runTurn promise-nudge', () => {
  it('pushes the model to act when it only states an intention, then runs the tool', async () => {
    const calls: string[] = []
    const provider = fakeProvider([
      [{ type: 'text', delta: "Sure, I'll search the web for you. Let me do that now." }, { type: 'done' }],
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'searched' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'Here are the results.' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'search the web' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys' })
    expect(calls).toEqual(['searched'])          // it actually acted after the nudge
    expect(out).toBe('Here are the results.')
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('did not call any tool'))).toBe(true)
  })

  it('nudges when the model prints a shell command in a fence but never runs it', async () => {
    const ran: string[] = []
    const bash: Tool = {
      schema: { name: 'Bash', description: 'run', parameters: { type: 'object', properties: {} } },
      run: async (a) => { ran.push(String(a.command)); return 'exit=0\nfile.txt' },
    }
    const provider = fakeProvider([
      [{ type: 'text', delta: "Let me list the files:\n```bash\nls -la\n```" }, { type: 'done' }],
      [{ type: 'tool_call', call: { id: '1', name: 'Bash', arguments: { command: 'ls -la' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'There is one file.' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'list the files' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [bash], systemPrompt: 'sys' })
    expect(ran).toEqual(['ls -la'])
    expect(out).toBe('There is one file.')
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('did not run it'))).toBe(true)
  })

  it('nudges when the model pastes file contents but never calls Write', async () => {
    const wrote: Array<Record<string, unknown>> = []
    const write: Tool = {
      schema: { name: 'Write', description: 'write', parameters: { type: 'object', properties: {} } },
      run: async (a) => { wrote.push(a); return 'Created index.html' },
    }
    const html = '<!DOCTYPE html>\n<html><body><h1>Resume</h1></body></html>'
    const provider = fakeProvider([
      [{ type: 'text', delta: `Let's create the index.html file using the Write tool. Here is the content:\n\`\`\`html\n${html}\n\`\`\`` }, { type: 'done' }],
      [{ type: 'tool_call', call: { id: '1', name: 'Write', arguments: { file_path: 'index.html', content: html } } }, { type: 'done' }],
      [{ type: 'text', delta: 'Created the site.' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'make a website from my resume' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [write], systemPrompt: 'sys' })
    expect(wrote).toHaveLength(1)
    expect(out).toBe('Created the site.')
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('did not save them'))).toBe(true)
  })

  it('breaks out of a degenerate repetition spiral instead of hanging, then nudges', async () => {
    const wrote: unknown[] = []
    const write: Tool = {
      schema: { name: 'Write', description: 'write', parameters: { type: 'object', properties: {} } },
      run: async (a) => { wrote.push(a); return 'Created index.html' },
    }
    // Step 0: the model spirals — the same sentence repeated far past the repetition threshold.
    const spiral = Array.from({ length: 60 }, () =>
      ({ type: 'text' as const, delta: "I apologize for the confusion. Let's write this content to the index.html file in your working directory. " }))
    const provider = fakeProvider([
      [...spiral, { type: 'done' }],
      [{ type: 'tool_call', call: { id: '1', name: 'Write', arguments: { file_path: 'index.html', content: '<html></html>' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'Done.' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'make the site' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [write], systemPrompt: 'sys' })
    expect(wrote).toHaveLength(1)                 // recovered and actually wrote the file
    expect(out).toBe('Done.')
    // The giant repeated blob must NOT have been stored verbatim in history.
    const assistantBlob = cm.messages().filter(m => m.role === 'assistant').map(m => m.content).join('')
    expect(assistantBlob.length).toBeLessThan(2000)
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('repeating yourself'))).toBe(true)
  })

  it('does NOT nudge a long explanation that merely includes a shell snippet', async () => {
    const ran: string[] = []
    const bash: Tool = {
      schema: { name: 'Bash', description: 'run', parameters: { type: 'object', properties: {} } },
      run: async (a) => { ran.push(String(a.command)); return 'ran' },
    }
    const longAnswer =
      'Great question. To list files you use the ls command, which prints directory entries. ' +
      'You can add flags like -l for a long listing and -a to include hidden dotfiles. ' +
      'On most systems this is instant even for large directories. For example:\n```bash\nls -la\n```\n' +
      'That covers the basics of listing files from a shell prompt.'
    const provider = fakeProvider([[{ type: 'text', delta: longAnswer }, { type: 'done' }]])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'how do I list files?' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [bash], systemPrompt: 'sys' })
    expect(ran).toEqual([])               // explanation, not an action
    expect(out).toContain('basics of listing files')
  })

  it('nudges past a flat "I can\'t access the internet" refusal, then runs the tool', async () => {
    const calls: string[] = []
    const provider = fakeProvider([
      [{ type: 'text', delta: "I'm sorry, but I can't access the internet to search for that." }, { type: 'done' }],
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'searched' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'Top 3 results: …' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'search the web' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys' })
    expect(calls).toEqual(['searched'])
    expect(out).toContain('Top 3 results')
  })
})

describe('runTurn repeat-guard', () => {
  it('blocks an identical tool call after 2 runs and tells the model to change approach', async () => {
    let runCount = 0
    const failTool: Tool = {
      schema: { name: 'Run', description: 'run', parameters: { type: 'object', properties: {} } },
      run: async () => { runCount++; return 'No such file or directory' },
    }
    const sameCall: ChatEvent[] = [{ type: 'tool_call', call: { id: 'x', name: 'Run', arguments: { cmd: 'python3 todo.py' } } }, { type: 'done' }]
    const provider = fakeProvider([sameCall, sameCall, sameCall, sameCall, [{ type: 'text', delta: 'giving up' }, { type: 'done' }]])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'run it' })
    await runTurn({ provider, model: 'm', cm, tools: [failTool], systemPrompt: 'sys', maxSteps: 6 })
    expect(runCount).toBe(2) // executed twice, then blocked on every repeat
    expect(cm.messages().some(m => m.role === 'tool' && m.content.includes('stop repeating'))).toBe(true)
  })
})

describe('runTurn', () => {
  it('executes a tool call then returns the final assistant text', async () => {
    const calls: string[] = []
    const provider = fakeProvider([
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'hi' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'all done' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'please echo hi' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys' })
    expect(calls).toEqual(['hi'])
    expect(out).toBe('all done')
  })

  it('persists narration that precedes a tool call via onStepText', async () => {
    const calls: string[] = []
    const stepTexts: string[] = []
    const provider = fakeProvider([
      [
        { type: 'text', delta: 'I will inspect the file first.' },
        { type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'hi' } } },
        { type: 'done' },
      ],
      [{ type: 'text', delta: 'done' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'please echo hi' })
    await runTurn({
      provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys',
      onStepText: t => stepTexts.push(t),
    })
    expect(stepTexts).toEqual(['I will inspect the file first.'])
  })

  it('returns immediately when the model emits no tool calls', async () => {
    const provider = fakeProvider([[{ type: 'text', delta: 'just text' }, { type: 'done' }]])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'hi' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [], systemPrompt: 'sys' })
    expect(out).toBe('just text')
  })

  it('records unknown-tool and thrown-tool errors as tool results, then continues', async () => {
    const boom: Tool = {
      schema: { name: 'Boom', description: '', parameters: { type: 'object', properties: {} } },
      run: async () => { throw new Error('kaboom') },
    }
    const provider = fakeProvider([
      [
        { type: 'tool_call', call: { id: '1', name: 'Ghost', arguments: {} } },
        { type: 'tool_call', call: { id: '2', name: 'Boom', arguments: {} } },
        { type: 'done' },
      ],
      [{ type: 'text', delta: 'handled' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'go' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [boom], systemPrompt: 'sys' })
    expect(out).toBe('handled')
    const toolMsgs = cm.messages().filter(m => m.role === 'tool').map(m => m.content)
    expect(toolMsgs.some(c => c.includes('unknown tool Ghost'))).toBe(true)
    expect(toolMsgs.some(c => c.includes('kaboom'))).toBe(true)
  })

  it('auto-compacts before stepping when context is near full, and fires onAutoCompact', async () => {
    const provider = fakeProvider([
      [{ type: 'text', delta: 'SUMMARY of earlier work' }, { type: 'done' }], // the summarize call
      [{ type: 'text', delta: 'final answer' }, { type: 'done' }],            // the model step
    ])
    // Tiny window so shouldCompact() is true on the first step.
    const cm = new ContextManager({ window: 100, outputReserve: 10 })
    cm.add({ role: 'user', content: 'x'.repeat(2000) })
    let compactNotices = 0
    const out = await runTurn({
      provider, model: 'm', cm, tools: [], systemPrompt: 'sys',
      onAutoCompact: () => { compactNotices++ },
    })
    expect(out).toBe('final answer')
    expect(compactNotices).toBeGreaterThan(0)             // the UI was told it happened
    const contents = cm.messages().map(m => m.content).join('\n')
    expect(contents).toContain('SUMMARY of earlier work') // earlier tail was replaced by the summary
  })

  it('does NOT auto-compact (or notify) when context is comfortably under the limit', async () => {
    const provider = fakeProvider([[{ type: 'text', delta: 'hi' }, { type: 'done' }]])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'short' })
    let compactNotices = 0
    await runTurn({
      provider, model: 'm', cm, tools: [], systemPrompt: 'sys',
      onAutoCompact: () => { compactNotices++ },
    })
    expect(compactNotices).toBe(0)
  })

  it('stops at maxSteps even if the model keeps calling tools', async () => {
    const calls: string[] = []
    const loopingScripts: ChatEvent[][] = Array.from({ length: 10 }, (_, i) => [
      { type: 'tool_call' as const, call: { id: 'x', name: 'Echo', arguments: { value: `again${i}` } } },
      { type: 'done' as const },
    ])
    const provider = fakeProvider(loopingScripts)
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'loop' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys', maxSteps: 3 })
    expect(out).toBe('Done.')      // empty-output guard: work happened, so not blank
    expect(calls.length).toBe(3)   // exactly maxSteps tool executions
  })
})

describe('runTurn permission gate', () => {
  const mkWrite = (ran: string[]) => ({
    schema: { name: 'Write', description: 'w', parameters: { type: 'object', properties: {} } },
    run: async () => { ran.push('write'); return 'wrote' },
  })

  it('denies mutations in plan mode without running the tool', async () => {
    const ran: string[] = []
    const provider = fakeProvider([
      [{ type: 'tool_call', call: { id: '1', name: 'Write', arguments: {} } }, { type: 'done' }],
      [{ type: 'text', delta: 'ok' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write a file' })
    await runTurn({ provider, model: 'm', cm, tools: [mkWrite(ran)], systemPrompt: 'sys', mode: 'plan' })
    expect(ran).toEqual([])
    expect(cm.messages().some(m => m.role === 'tool' && m.content.includes('not allowed in plan'))).toBe(true)
  })

  it('runs a mutation in default mode only after onPermissionAsk approves', async () => {
    const ran: string[] = []
    const provider = fakeProvider([
      [{ type: 'tool_call', call: { id: '1', name: 'Write', arguments: {} } }, { type: 'done' }],
      [{ type: 'text', delta: 'done' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    await runTurn({ provider, model: 'm', cm, tools: [mkWrite(ran)], systemPrompt: 'sys', mode: 'default', onPermissionAsk: async () => false })
    expect(ran).toEqual([])
    expect(cm.messages().some(m => m.role === 'tool' && m.content.includes('denied by user'))).toBe(true)
  })
})

describe('runTurn auto-repair', () => {
  it('nudges once when text looks like a botched tool call, then executes', async () => {
    const calls: string[] = []
    const provider = fakeProvider([
      // step 0: malformed-looking attempt (mentions Echo + braces, but not valid JSON call)
      [{ type: 'text', delta: 'I will call { Echo with value hi }' }, { type: 'done' }],
      // step 1: after the repair nudge, emit a proper native tool call
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'hi' } } }, { type: 'done' }],
      // step 2: final answer
      [{ type: 'text', delta: 'finished' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'echo hi' })
    const out = await runTurn({ provider, model: 'm', cm, tools: [echoTool(calls)], systemPrompt: 'sys' })
    expect(calls).toEqual(['hi'])
    expect(out).toBe('finished')
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('ONLY a JSON object'))).toBe(true)
  })
})
