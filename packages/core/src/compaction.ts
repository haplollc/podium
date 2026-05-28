import type { ChatMessage } from '@maestro/providers'
import type { ContextStats } from './types.js'
import type { ContextManager } from './context.js'

export const SUMMARY_PROMPT = `Summarize the conversation below so work can continue with the detail intact. Use these sections:
1. Task — what the user is trying to accomplish.
2. Current state — what has been done so far.
3. Files & code — files touched and key snippets, with why.
4. Decisions — important choices made.
5. Next steps — the immediate next action.
Be concise but preserve technical specifics. Output only the summary.`

/** Trigger when used tokens are within `buffer` of the effective window. */
export function shouldCompact(stats: ContextStats, buffer: number): boolean {
  return stats.used >= stats.effective - buffer
}

export interface CompactOpts {
  /** Calls the model with a prompt, returns the summary text. */
  summarize: (prompt: string) => Promise<string>
  /** Number of leading messages to retain verbatim (e.g. the original task). */
  prefixCount: number
}

export async function compact(cm: ContextManager, opts: CompactOpts): Promise<void> {
  const tail = cm.messages().slice(opts.prefixCount)
  const transcript = tail.map(renderMessage).join('\n\n')
  const summary = await opts.summarize(`${SUMMARY_PROMPT}\n\n---\n${transcript}`)
  cm.replaceWithSummary(summary, opts.prefixCount)
}

function renderMessage(m: ChatMessage): string {
  const calls = m.tool_calls?.map(tc => `\n  -> ${tc.name}(${JSON.stringify(tc.arguments)})`).join('') ?? ''
  return `[${m.role}] ${m.content}${calls}`
}
