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

  it('tells the model it HAS web access when WebSearch is available', () => {
    const withWeb = buildSystemPrompt({ cwd: '/p', os: 'darwin', toolNames: ['Read', 'WebSearch', 'WebFetch'] })
    expect(withWeb.toLowerCase()).toContain('internet access')
    expect(withWeb).toContain('WebSearch')
    const withoutWeb = buildSystemPrompt({ cwd: '/p', os: 'darwin', toolNames: ['Read', 'Bash'] })
    expect(withoutWeb.toLowerCase()).not.toContain('internet access')
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
    expect(cm.messages().some(m => m.role === 'user' && m.content.includes('did NOT call any tool'))).toBe(true)
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

  it('auto-compacts before stepping when context is near full', async () => {
    const provider = fakeProvider([
      [{ type: 'text', delta: 'SUMMARY of earlier work' }, { type: 'done' }], // the summarize call
      [{ type: 'text', delta: 'final answer' }, { type: 'done' }],            // the model step
    ])
    // Tiny window so shouldCompact() is true on the first step.
    const cm = new ContextManager({ window: 100, outputReserve: 10 })
    cm.add({ role: 'user', content: 'x'.repeat(2000) })
    const out = await runTurn({ provider, model: 'm', cm, tools: [], systemPrompt: 'sys' })
    expect(out).toBe('final answer')
    const contents = cm.messages().map(m => m.content).join('\n')
    expect(contents).toContain('SUMMARY of earlier work') // earlier tail was replaced by the summary
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
    expect(out).toBe('')           // never produced a final text
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
