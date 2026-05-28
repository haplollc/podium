import { describe, it, expect } from 'vitest'
import { buildSystemPrompt } from '../src/system-prompt.js'

describe('buildSystemPrompt', () => {
  it('is compact (<1200 tokens worth of chars) and includes cwd + tool discipline', () => {
    const p = buildSystemPrompt({ cwd: '/work/proj', os: 'darwin', toolNames: ['Read', 'Edit', 'Bash'] })
    expect(p).toContain('/work/proj')
    expect(p.toLowerCase()).toContain('read')
    expect(p.length).toBeLessThan(4800) // ~1200 tokens at 4 chars/token
  })
})

import { runTurn } from '../src/loop.js'
import { ContextManager } from '../src/context.js'
import type { Provider, ChatEvent } from '@maestro/providers'
import type { Tool } from '@maestro/tools'

function fakeProvider(scripts: ChatEvent[][]): Provider {
  let turn = 0
  return {
    id: 'ollama',
    health: async () => ({ running: true }),
    listLocal: async () => [],
    pull: async () => {},
    capabilities: async () => ({ tools: true }),
    async *chat() { for (const e of scripts[turn++]) yield e },
  }
}

describe('runTurn', () => {
  it('executes a tool call then returns the final assistant text', async () => {
    const calls: string[] = []
    const echoTool: Tool = {
      schema: { name: 'Echo', description: 'echo', parameters: { type: 'object', properties: {} } },
      run: async (a) => { calls.push(String(a.value)); return `echoed ${a.value}` },
    }
    const provider = fakeProvider([
      [{ type: 'tool_call', call: { id: '1', name: 'Echo', arguments: { value: 'hi' } } }, { type: 'done' }],
      [{ type: 'text', delta: 'all done' }, { type: 'done' }],
    ])
    const cm = new ContextManager({ window: 8192, outputReserve: 2000 })
    cm.add({ role: 'user', content: 'please echo hi' })
    const out = await runTurn({
      provider, model: 'm', cm, tools: [echoTool], systemPrompt: 'sys',
    })
    expect(calls).toEqual(['hi'])
    expect(out).toBe('all done')
  })
})
