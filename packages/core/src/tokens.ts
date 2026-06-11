import type { ChatMessage } from '@podium/providers'

const CHARS_PER_TOKEN = 4
const PER_MESSAGE_OVERHEAD = 4

/**
 * Real BPE token counting (cl100k vocabulary). The chars/4 heuristic undercounts
 * code by ~20-30%, which made compaction fire late and let Ollama silently
 * truncate the front of the context — the worst failure mode for a small window.
 * cl100k's 100k vocab counts slightly HIGH for the 150k+-vocab local models
 * (Qwen, Llama), which is the safe direction for a budget.
 *
 * Loaded lazily (it's ~2MB of merge ranks) with the heuristic as fallback so a
 * broken install degrades to the old behavior instead of crashing.
 */
let countBpe: ((text: string) => number) | null = null

/** Resolves once the real tokenizer is loaded (or failed and we keep the heuristic). */
export const tokenizerReady: Promise<boolean> = import('gpt-tokenizer/encoding/cl100k_base')
  .then(m => { countBpe = m.countTokens; return true })
  .catch(() => false)

export function estimateTokens(text: string): number {
  if (countBpe) {
    try { return countBpe(text) } catch { /* fall back below */ }
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN)
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += PER_MESSAGE_OVERHEAD + estimateTokens(m.content)
    for (const tc of m.tool_calls ?? []) {
      total += estimateTokens(tc.name + JSON.stringify(tc.arguments))
    }
  }
  return total
}
