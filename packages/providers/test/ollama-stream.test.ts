import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaProvider } from '../src/ollama.js'

function ndjson(objs: unknown[]): Response {
  const body = objs.map(o => JSON.stringify(o)).join('\n') + '\n'
  return new Response(body, { status: 200 })
}

describe('OllamaProvider streaming', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('chat() yields text deltas, tool calls, and done', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([
      { message: { content: 'Hello ' } },
      { message: { content: 'world' } },
      { message: { tool_calls: [{ function: { name: 'Read', arguments: { file_path: '/x' } } }] } },
      { message: { content: '' }, done: true },
    ])))
    const p = new OllamaProvider()
    const events: Array<{ type: string }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) events.push(e)

    const text = events.filter((e): e is { type: 'text'; delta: string } => e.type === 'text')
      .map(e => e.delta).join('')
    expect(text).toBe('Hello world')

    const calls = events.filter((e): e is { type: 'tool_call'; call: { name: string; arguments: Record<string, unknown> } } => e.type === 'tool_call')
    expect(calls).toHaveLength(1)
    expect(calls[0].call.name).toBe('Read')
    expect(calls[0].call.arguments).toEqual({ file_path: '/x' })

    expect(events.some(e => e.type === 'done')).toBe(true)
  })

  it('chat() gives the same tool call a deterministic id for the same arguments', async () => {
    const make = () => ndjson([
      { message: { tool_calls: [{ function: { name: 'Read', arguments: { file_path: '/x' } } }] } },
      { done: true },
    ])
    vi.stubGlobal('fetch', vi.fn(async () => make()))
    const p = new OllamaProvider()
    const ids: string[] = []
    for (let i = 0; i < 2; i++) {
      for await (const e of p.chat({ model: 'm', messages: [] })) {
        if (e.type === 'tool_call') ids.push(e.call.id)
      }
    }
    expect(ids[0]).toBe(ids[1])
  })

  it('chat() accepts stringified tool arguments from local backends', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([
      { message: { tool_calls: [{ function: { name: 'Read', arguments: '{"file_path":"/x"}' } }] } },
      { done: true },
    ])))
    const p = new OllamaProvider()
    const calls: Array<{ arguments: Record<string, unknown> }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) {
      if (e.type === 'tool_call') calls.push(e.call)
    }
    expect(calls[0].arguments).toEqual({ file_path: '/x' })
  })

  it('chat() surfaces Ollama stream errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([{ error: 'model not found' }])))
    const p = new OllamaProvider()
    await expect(async () => {
      for await (const _ of p.chat({ model: 'm', messages: [] })) {
        // consume stream
      }
    }).rejects.toThrow(/model not found/)
  })

  it('pull() reports each progress line to the callback', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ndjson([
      { status: 'pulling manifest' },
      { status: 'downloading', total: 100, completed: 50 },
      { status: 'success', total: 100, completed: 100 },
    ])))
    const p = new OllamaProvider()
    const updates: Array<{ status: string; completed?: number }> = []
    await p.pull('m', u => updates.push(u))
    expect(updates).toHaveLength(3)
    expect(updates[2].completed).toBe(100)
  })
})
