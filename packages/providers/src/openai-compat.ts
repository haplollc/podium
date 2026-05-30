import type {
  Provider, HealthStatus, LocalModel, PullProgress, ModelCapabilities,
  ChatRequest, ChatEvent, ToolCall,
} from './types.js'
import { coerceToolArguments, streamError } from './tool-args.js'

/** Shared adapter for OpenAI-compatible local servers (LM Studio, mlx_lm.server). */
export class OpenAICompatProvider implements Provider {
  constructor(
    readonly id: 'lmstudio' | 'mlx',
    protected base: string,
  ) {}

  async health(): Promise<HealthStatus> {
    try {
      const r = await fetch(`${this.base}/models`)
      return { running: r.ok }
    } catch (e) {
      return { running: false, detail: (e as Error).message }
    }
  }

  async listLocal(): Promise<LocalModel[]> {
    const r = await fetch(`${this.base}/models`)
    const data = await r.json() as { data?: { id: string }[] }
    return (data.data ?? []).map(m => ({ name: m.id, sizeBytes: 0 }))
  }

  async pull(_model: string, _onProgress: (p: PullProgress) => void): Promise<void> {
    throw new Error(`${this.id}: model download is not supported here; install the model in the backend.`)
  }

  async capabilities(_model: string): Promise<ModelCapabilities> {
    // OpenAI-compatible servers don't advertise capabilities; assume tools and
    // rely on the parsed-tool fallback if the model emits calls as text.
    return { tools: true }
  }

  async *chat(req: ChatRequest): AsyncIterable<ChatEvent> {
    const r = await fetch(`${this.base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: req.model,
        messages: req.messages.map(m => ({
          role: m.role,
          // Strict OpenAI-compatible servers want content:null (not "") with tool_calls.
          content: m.tool_calls?.length && !m.content ? null : m.content,
          tool_calls: m.tool_calls?.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
          tool_call_id: m.tool_call_id,
        })),
        tools: req.tools?.map(t => ({ type: 'function', function: t })),
        temperature: req.temperature ?? 0.2,
        stream: true,
      }),
      signal: req.signal,
    })
    if (!r.ok) throw new Error(`chat failed: HTTP ${r.status} ${(await r.text().catch(() => '')).slice(0, 200)}`)
    if (!r.body) throw new Error('no response body from /chat/completions')

    const acc = new Map<number, { id: string; name: string; args: string }>()
    for await (const data of readSse(r.body)) {
      if (data === '[DONE]') break
      let j: { choices?: { delta?: { content?: string; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] } }[] }
      try { j = JSON.parse(data) } catch { continue }
      const error = streamError(j)
      if (error) throw new Error(`${this.id} chat failed: ${error}`)
      const delta = j.choices?.[0]?.delta
      if (delta?.content) yield { type: 'text', delta: delta.content }
      for (const tc of delta?.tool_calls ?? []) {
        const cur = acc.get(tc.index) ?? { id: '', name: '', args: '' }
        if (tc.id) cur.id = tc.id
        if (tc.function?.name) cur.name = tc.function.name
        if (tc.function?.arguments) cur.args += tc.function.arguments
        acc.set(tc.index, cur)
      }
    }
    for (const [i, c] of acc) {
      if (!c.name) continue
      const args = coerceToolArguments(c.args)
      const call: ToolCall = { id: c.id || `oai_${c.name}_${i}`, name: c.name, arguments: args }
      yield { type: 'tool_call', call }
    }
    yield { type: 'done' }
  }
}

async function* readSse(body: ReadableStream<Uint8Array>): AsyncIterable<string> {
  const reader = body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let eventData: string[] = []

  function flush(): string | undefined {
    if (!eventData.length) return undefined
    const data = eventData.join('\n').trim()
    eventData = []
    return data || undefined
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const raw = buf.slice(0, nl)
      buf = buf.slice(nl + 1)
      const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw
      if (line === '') {
        const data = flush()
        if (data) yield data
      } else if (line.startsWith('data:')) {
        eventData.push(line.slice(5).trimStart())
      }
    }
  }
  buf += dec.decode()
  if (buf) {
    const line = buf.endsWith('\r') ? buf.slice(0, -1) : buf
    if (line.startsWith('data:')) eventData.push(line.slice(5).trimStart())
  }
  const data = flush()
  if (data) yield data
}
