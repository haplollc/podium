import type { Provider, ChatMessage, ToolCall } from '@maestro/providers'
import type { Tool, TodoStore } from '@maestro/tools'
import { ContextManager } from './context.js'
import { shouldCompact, compact } from './compaction.js'
import { extractToolCalls } from './tool-parse.js'
import { decide, type PermissionMode } from './permission.js'

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
  mode?: PermissionMode
  /** Called when a tool needs interactive approval; return false to deny. */
  onPermissionAsk?: (call: ToolCall) => Promise<boolean>
  /** Max times to nudge the model to re-emit a valid tool call. Default 1. */
  maxRepairs?: number
  /** Shared todo store passed to tools (e.g. TodoWrite). */
  todos?: TodoStore
}

/** Heuristic: the model's text looks like a botched tool call (mentions a tool name inside JSON-ish braces). */
function looksLikeToolAttempt(text: string, schemas: { name: string }[]): boolean {
  const hasBrace = text.includes('{') && text.includes('}')
  return hasBrace && schemas.some(s => text.includes(s.name))
}

/** Runs one user turn to completion: loops model<->tools until the model stops
 *  calling tools, returns the final assistant text. Auto-compacts before each step. */
export async function runTurn(opts: RunTurnOpts): Promise<string> {
  const { provider, model, cm, tools, systemPrompt } = opts
  const maxSteps = opts.maxSteps ?? 12
  const buffer = opts.compactBuffer ?? 1500
  const toolSchemas = tools.map(t => t.schema)

  const mode = opts.mode ?? 'default'
  let repairs = 0
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

    // Dual-path: prefer native tool_calls; otherwise fall back to parsing a
    // tool call the model emitted as plain-text JSON (common with small models).
    let effectiveCalls = toolCalls
    let assistantText = text
    if (toolCalls.length === 0) {
      const parsed = extractToolCalls(text, toolSchemas.map(s => s.name))
      if (parsed.calls.length > 0) {
        effectiveCalls = parsed.calls
        assistantText = parsed.cleanedText
      }
    }

    cm.add({ role: 'assistant', content: assistantText, tool_calls: effectiveCalls.length ? effectiveCalls : undefined })

    if (effectiveCalls.length === 0) {
      // Auto-repair: if the text looks like a failed tool call, nudge once for valid JSON.
      if (repairs < (opts.maxRepairs ?? 1) && looksLikeToolAttempt(assistantText, toolSchemas)) {
        repairs++
        cm.add({
          role: 'user',
          content: 'Your previous message looked like a tool call but could not be parsed. Reply with ONLY a JSON object of the form {"name": <tool>, "arguments": {...}} and no other text.',
        })
        continue
      }
      finalText = assistantText
      break
    }

    for (const call of effectiveCalls) {
      const d = decide(call.name, mode)
      if (d === 'deny') {
        cm.add({ role: 'tool', content: `Permission denied: ${call.name} is not allowed in ${mode} mode.`, tool_call_id: call.id })
        continue
      }
      if (d === 'ask') {
        const ok = opts.onPermissionAsk ? await opts.onPermissionAsk(call) : true
        if (!ok) {
          cm.add({ role: 'tool', content: `Permission denied by user: ${call.name}.`, tool_call_id: call.id })
          continue
        }
      }
      opts.onToolStart?.(call)
      const tool = tools.find(t => t.schema.name === call.name)
      let result: string
      try {
        result = tool
          ? await tool.run(call.arguments, { cwd: opts.cwd ?? process.cwd(), todos: opts.todos })
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
