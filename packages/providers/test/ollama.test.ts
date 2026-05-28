import { describe, it, expect, vi, beforeEach } from 'vitest'
import { OllamaProvider } from '../src/ollama.js'

function jsonResponse(obj: unknown) {
  return new Response(JSON.stringify(obj), { status: 200 })
}

describe('OllamaProvider', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('health() returns running:true when /api/tags responds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ models: [] })))
    const p = new OllamaProvider()
    expect((await p.health()).running).toBe(true)
  })

  it('listLocal() maps /api/tags into LocalModel[]', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ models: [{ name: 'qwen2.5-coder:7b', size: 4700000000 }] })))
    const p = new OllamaProvider()
    const models = await p.listLocal()
    expect(models).toEqual([{ name: 'qwen2.5-coder:7b', sizeBytes: 4700000000 }])
  })

  it('capabilities() reads the capabilities array from /api/show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ capabilities: ['completion', 'tools'], model_info: { 'general.context_length': 32768 } })))
    const p = new OllamaProvider()
    const caps = await p.capabilities('qwen2.5-coder:7b')
    expect(caps.tools).toBe(true)
    expect(caps.contextLength).toBe(32768)
  })
})
