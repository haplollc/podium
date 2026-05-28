import type { Provider, ChatMessage, ToolCall } from '@maestro/providers'
import type { Tool } from '@maestro/tools'
import { ContextManager } from './context.js'
import { shouldCompact, compact } from './compaction.js'

export interface RunTurnOpts {
  provider: Provider
  model: string
  cm: ContextManager
  tools: Tool[]
  systemPrompt: string
  numCtx?: number
  cwd?: string
  compactBuffer?: number
  onText?: (delta: string) => void
  onToolStart?: (call: ToolCall) => void
  maxSteps?: number
}

/** Runs one user turn to completion: loops model<->tools until the model stops
 *  calling tools, returns the final assistant text. Auto-compacts before each step. */
export async function runTurn(opts: RunTurnOpts): Promise<string> {
  const { provider, model, cm, tools, systemPrompt } = opts
  const maxSteps = opts.maxSteps ?? 12
  const buffer = opts.compactBuffer ?? 1500
  const toolSchemas = tools.map(t => t.schema)

  let finalText = ''
  for (let step = 0; step < maxSteps; step++) {
    if (shouldCompact(cm.stats(), buffer)) {
      await compact(cm, {
        prefixCount: 1,
        summarize: async (prompt) => collectText(provider.chat({
          model, numCtx: opts.numCtx,
          messages: [{ role: 'user', content: prompt }],
        })),
      })
    }

    const messages: ChatMessage[] = [{ role: 'system', content: systemPrompt }, ...cm.messages()]
    let text = ''
    const toolCalls: ToolCall[] = []
    for await (const ev of provider.chat({ model, messages, tools: toolSchemas, numCtx: opts.numCtx })) {
      if (ev.type === 'text') { text += ev.delta; opts.onText?.(ev.delta) }
      else if (ev.type === 'tool_call') toolCalls.push(ev.call)
    }

    cm.add({ role: 'assistant', content: text, tool_calls: toolCalls.length ? toolCalls : undefined })

    if (toolCalls.length === 0) { finalText = text; break }

    for (const call of toolCalls) {
      opts.onToolStart?.(call)
      const tool = tools.find(t => t.schema.name === call.name)
      let result: string
      try {
        result = tool
          ? await tool.run(call.arguments, { cwd: opts.cwd ?? process.cwd() })
          : `Error: unknown tool ${call.name}`
      } catch (e) {
        result = `Error: ${(e as Error).message}`
      }
      cm.add({ role: 'tool', content: result, tool_call_id: call.id })
    }
  }
  return finalText
}

async function collectText(stream: AsyncIterable<{ type: string } & Record<string, unknown>>): Promise<string> {
  let out = ''
  for await (const ev of stream) if (ev.type === 'text') out += String(ev.delta)
  return out
}
