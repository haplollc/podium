import type {
  Provider, HealthStatus, LocalModel, PullProgress, ModelCapabilities,
  ChatRequest, ChatEvent, ToolCall,
} from './types.js'

export class OllamaProvider implements Provider {
  readonly id = 'ollama' as const
  constructor(private base = process.env.OLLAMA_HOST ?? 'http://localhost:11434') {}

  async health(): Promise<HealthStatus> {
    try {
      const r = await fetch(`${this.base}/api/tags`)
      return { running: r.ok }
    } catch (e) {
      return { running: false, detail: (e as Error).message }
    }
  }

  async listLocal(): Promise<LocalModel[]> {
    const r = await fetch(`${this.base}/api/tags`)
    const data = await r.json() as { models?: { name: string; size: number }[] }
    return (data.models ?? []).map(m => ({ name: m.name, sizeBytes: m.size }))
  }

  async pull(model: string, onProgress: (p: PullProgress) => void): Promise<void> {
    const r = await fetch(`${this.base}/api/pull`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, stream: true }),
    })
    if (!r.body) throw new Error('no response body from /api/pull')
    for await (const line of readNdjson(r.body)) {
      onProgress(line as PullProgress)
    }
  }

  /** Preload the model (empty generate) so the first real turn isn't a cold start. */
  async warm(model: string, keepAlive = '30m'): Promise<void> {
    try {
      await fetch(`${this.base}/api/generate`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, prompt: '', stream: false, keep_alive: keepAlive }),
      })
    } catch { /* best-effort warmup */ }
  }

  /** Currently-loaded models and their memory footprint (GET /api/ps). */
  async ps(): Promise<{ name: string; sizeBytes: number; sizeVramBytes: number }[]> {
    const r = await fetch(`${this.base}/api/ps`)
    const data = await r.json() as { models?: { name: string; size: number; size_vram: number }[] }
    return (data.models ?? []).map(m => ({ name: m.name, sizeBytes: m.size, sizeVramBytes: m.size_vram }))
  }

  /** Delete a downloaded model (frees disk). */
  async remove(model: string): Promise<void> {
    const r = await fetch(`${this.base}/api/delete`, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    if (!r.ok) throw new Error(`failed to delete ${model} (HTTP ${r.status})`)
  }

  async capabilities(model: string): Promise<ModelCapabilities> {
    const r = await fetch(`${this.base}/api/show`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model }),
    })
    const data = await r.json() as { capabilities?: string[]; model_info?: Record<string, number> }
    const ctxKey = Object.keys(data.model_info ?? {}).find(k => k.endsWith('context_length'))
    return {
      tools: (data.capabilities ?? []).includes('tools'),
      contextLength: ctxKey ? data.model_info![ctxKey] : undefined,
    }
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const r = await fetch(`${this.base}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map(m => ({
          role: m.role, content: m.content,
          tool_calls: m.tool_calls?.map(tc => ({ function: { name: tc.name, arguments: tc.arguments } })),
        })),
        tools: req.tools?.map(t => ({ type: 'function', function: t })),
        stream: true,
        keep_alive: req.keepAlive,
        options: { num_ctx: req.numCtx, temperature: req.temperature ?? 0.2 },
      }),
      signal: req.signal,
    })
    if (!r.body) throw new Error('no response body from /api/chat')
    for await (const chunk of readNdjson(r.body)) {
      const c = chunk as {
        message?: { content?: string; tool_calls?: { function: { name: string; arguments: Record<string, unknown> } }[] }
        done?: boolean
      }
      if (c.message?.content) yield { type: 'text', delta: c.message.content }
      for (const tc of c.message?.tool_calls ?? []) {
        const call: ToolCall = {
          id: `call_${tc.function.name}_${Math.abs(hash(JSON.stringify(tc.function.arguments)))}`,
          name: tc.function.name,
          arguments: tc.function.arguments,
        }
        yield { type: 'tool_call', call }
      }
      if (c.done) yield { type: 'done' }
    }
  }
}

// Deterministic id helper (no Math.random for reproducibility).
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return h
}

async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (line) yield JSON.parse(line)
    }
  }
  if (buf.trim()) yield JSON.parse(buf.trim())
}
