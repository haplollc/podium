import type { ChatMessage } from '@podium/providers'
import type { ContextStats } from './types.js'
import type { ContextManager } from './context.js'

export const SUMMARY_PROMPT = `Summarize the conversation below so the assistant can seamlessly CONTINUE the work without losing the thread. Use these sections:
1. Task — what the user asked for, in full (the goal still being worked on).
2. Done so far — concrete steps already completed (files created/edited, commands run, what they returned).
3. Files & code — files touched and key snippets/paths, with why.
4. Decisions & constraints — important choices made and rules to keep following.
5. Next step — the single next action to take RIGHT NOW, including the exact tool or command and any paths, IDs, or values needed to do it.
Preserve technical specifics (paths, names, values). Output only the summary.`

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
