import type { ChatMessage } from '@podium/providers'

const CHARS_PER_TOKEN = 4
const PER_MESSAGE_OVERHEAD = 4

export function estimateTokens(text: string): number {
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
