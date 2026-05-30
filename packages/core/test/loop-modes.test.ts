import { describe, it, expect } from 'vitest'
import { runTurn } from '../src/loop.js'
import { ContextManager } from '../src/context.js'
import type { Provider, ChatEvent, ChatRequest } from '@podium/providers'
import type { Tool } from '@podium/tools'

function scriptedProvider(scripts: ChatEvent[][], seen?: ChatRequest[]): Provider {
  let turn = 0
  return {
    id: 'ollama',
    health: async () => ({ running: true }),
    listLocal: async () => [],
    pull: async () => {},
    capabilities: async () => ({ tools: true }),
    async *chat(req: ChatRequest) { seen?.push(req); for (const e of scripts[turn++] ?? []) yield e },
  }
}

const writeTool = (ran: string[]): Tool => ({
  schema: { name: 'Write', description: 'w', parameters: { type: 'object', properties: {} } },
  run: async () => { ran.push('write'); return 'ok' },
})

const oneWriteThenDone: ChatEvent[][] = [
  [{ type: 'tool_call', call: { id: '1', name: 'Write', arguments: { file_path: 'x' } } }, { type: 'done' }],
  [{ type: 'text', delta: 'finished' }, { type: 'done' }],
]

describe('runTurn permission modes', () => {
  it('yolo mode runs mutating tools without asking', async () => {
    const ran: string[] = []
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    let asked = false
    await runTurn({
      provider: scriptedProvider(oneWriteThenDone), model: 'm', cm, tools: [writeTool(ran)],
      systemPrompt: 'sys', mode: 'yolo', onPermissionAsk: async () => { asked = true; return true },
    })
    expect(ran).toEqual(['write'])
    expect(asked).toBe(false)   // yolo never prompts
  })

  it('plan mode denies mutating tools entirely', async () => {
    const ran: string[] = []
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    await runTurn({
      provider: scriptedProvider(oneWriteThenDone), model: 'm', cm, tools: [writeTool(ran)],
      systemPrompt: 'sys', planMode: true,
    })
    expect(ran).toEqual([])
    expect(cm.messages().some(m => m.role === 'tool' && /not allowed in plan/.test(m.content))).toBe(true)
  })

  it('preToolUse hook can block a tool before it runs', async () => {
    const ran: string[] = []
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    await runTurn({
      provider: scriptedProvider(oneWriteThenDone), model: 'm', cm, tools: [writeTool(ran)],
      systemPrompt: 'sys', mode: 'yolo', preToolUse: async () => false,
    })
    expect(ran).toEqual([])
    expect(cm.messages().some(m => m.role === 'tool' && /Blocked by PreToolUse/.test(m.content))).toBe(true)
  })
})

describe('runTurn plumbing', () => {
  it('passes keepAlive and temperature through to the provider', async () => {
    const seen: ChatRequest[] = []
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'hi' })
    await runTurn({
      provider: scriptedProvider([[{ type: 'text', delta: 'done' }, { type: 'done' }]], seen),
      model: 'm', cm, tools: [], systemPrompt: 'sys', keepAlive: '15m', temperature: 0,
    })
    expect(seen[0].keepAlive).toBe('15m')
    expect(seen[0].temperature).toBe(0)
  })

  it('fires onToolResult with the tool output', async () => {
    const results: string[] = []
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    await runTurn({
      provider: scriptedProvider(oneWriteThenDone), model: 'm', cm, tools: [writeTool([])],
      systemPrompt: 'sys', mode: 'yolo', onToolResult: (_c, r) => results.push(r),
    })
    expect(results).toEqual(['ok'])
  })

  it('a tool throwing surfaces an error result but does not crash the turn', async () => {
    const boom: Tool = {
      schema: { name: 'Write', description: 'w', parameters: { type: 'object', properties: {} } },
      run: async () => { throw new Error('disk full') },
    }
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'write' })
    const out = await runTurn({
      provider: scriptedProvider(oneWriteThenDone), model: 'm', cm, tools: [boom],
      systemPrompt: 'sys', mode: 'yolo',
    })
    expect(out).toBe('finished')
    expect(cm.messages().some(m => m.role === 'tool' && /disk full/.test(m.content))).toBe(true)
  })
})
