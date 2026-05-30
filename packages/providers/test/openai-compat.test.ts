import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OpenAICompatProvider } from '../src/openai-compat.js'

function sse(lines: string[]): Response {
  const body = lines.map(l => `data: ${l}\n\n`).join('')
  return new Response(body, { status: 200 })
}
function jsonResponse(obj: unknown): Response {
  return new Response(JSON.stringify(obj), { status: 200 })
}

describe('OpenAICompatProvider', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('health() and listLocal() use /models', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ data: [{ id: 'foo' }, { id: 'bar' }] })))
    const p = new OpenAICompatProvider('mlx', 'http://localhost:8080/v1')
    expect((await p.health()).running).toBe(true)
    expect((await p.listLocal()).map(m => m.name)).toEqual(['foo', 'bar'])
  })

  it('chat() streams text and assembles a fragmented tool call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { content: 'Hel' } }] }),
      JSON.stringify({ choices: [{ delta: { content: 'lo' } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'Write' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"file_path":"a",' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"content":"x"}' } }] } }] }),
      '[DONE]',
    ])))
    const p = new OpenAICompatProvider('lmstudio', 'http://localhost:1234/v1')
    const events: Array<{ type: string }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) events.push(e)

    const text = events.filter((e): e is { type: 'text'; delta: string } => e.type === 'text').map(e => e.delta).join('')
    expect(text).toBe('Hello')
    const call = events.find((e): e is { type: 'tool_call'; call: { name: string; arguments: Record<string, unknown> } } => e.type === 'tool_call')
    expect(call?.call.name).toBe('Write')
    expect(call?.call.arguments).toEqual({ file_path: 'a', content: 'x' })
    expect(events.at(-1)?.type).toBe('done')
  })

  it('chat() preserves multiline Write content in fragmented tool arguments', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'Write' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '{"file_path":"todo.py",' } }] } }] }),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"content":"print(1)\nprint(2)\n"}' } }] } }] }),
      '[DONE]',
    ])))
    const p = new OpenAICompatProvider('lmstudio', 'http://localhost:1234/v1')
    const events: Array<{ type: string }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) events.push(e)
    const call = events.find((e): e is { type: 'tool_call'; call: { arguments: Record<string, unknown> } } => e.type === 'tool_call')
    expect(call?.call.arguments.content).toBe('print(1)\nprint(2)\n')
  })

  it('chat() marks malformed stringified tool arguments instead of dropping them', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'c1', function: { name: 'Write', arguments: 'not-json' } }] } }] }),
      '[DONE]',
    ])))
    const p = new OpenAICompatProvider('lmstudio', 'http://localhost:1234/v1')
    const events: Array<{ type: string }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) events.push(e)
    const call = events.find((e): e is { type: 'tool_call'; call: { arguments: Record<string, unknown> } } => e.type === 'tool_call')
    expect(call?.call.arguments.__parse_error).toMatch(/not valid JSON/)
  })

  it('chat() tolerates multi-line SSE data events', async () => {
    const body = 'data: {"choices":[\ndata: {"delta":{"content":"Hello"}}\ndata: ]}\n\ndata: [DONE]\n\n'
    vi.stubGlobal('fetch', vi.fn(async () => new Response(body, { status: 200 })))
    const p = new OpenAICompatProvider('lmstudio', 'http://localhost:1234/v1')
    const events: Array<{ type: string }> = []
    for await (const e of p.chat({ model: 'm', messages: [] })) events.push(e)
    const text = events.filter((e): e is { type: 'text'; delta: string } => e.type === 'text').map(e => e.delta).join('')
    expect(text).toBe('Hello')
  })

  it('chat() surfaces backend stream errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => sse([
      JSON.stringify({ error: { message: 'model unloaded' } }),
    ])))
    const p = new OpenAICompatProvider('lmstudio', 'http://localhost:1234/v1')
    await expect(async () => {
      for await (const _ of p.chat({ model: 'm', messages: [] })) {
        // consume stream
      }
    }).rejects.toThrow(/model unloaded/)
  })

  it('pull() throws for the base adapter', async () => {
    const p = new OpenAICompatProvider('mlx', 'http://localhost:8080/v1')
    await expect(p.pull('m', () => {})).rejects.toThrow(/not supported/)
  })
})
