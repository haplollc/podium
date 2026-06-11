import type { ChatMessage } from '@podium/providers'
import { estimateMessageTokens } from './tokens.js'
import type { ContextStats } from './types.js'

export interface ContextOpts { window: number; outputReserve: number }

export class ContextManager {
  private msgs: ChatMessage[] = []
  // Running token estimate, updated incrementally on add() so stats() is O(1)
  // instead of re-scanning every message (it's polled constantly by the UI).
  private used = 0
  constructor(private opts: ContextOpts) {}

  add(m: ChatMessage): void {
    this.msgs.push(m)
    this.used += estimateMessageTokens([m])
  }
  messages(): ChatMessage[] { return this.msgs }
  length(): number { return this.msgs.length }

  /** Drop everything after index `n` (used by /rewind). */
  truncateTo(n: number): void {
    this.msgs = this.msgs.slice(0, Math.max(0, n))
    this.used = estimateMessageTokens(this.msgs)
  }

  stats(): ContextStats {
    const effective = this.opts.window - this.opts.outputReserve
    return {
      used: this.used,
      effective,
      window: this.opts.window,
      percentUsed: effective > 0 ? this.used / effective : 1,
    }
  }

  /** Keep the first `prefixCount` messages, replace the rest with one summary. */
  replaceWithSummary(summary: string, prefixCount: number): void {
    const prefix = this.msgs.slice(0, prefixCount)
    this.msgs = [
      ...prefix,
      { role: 'user', content: `[Earlier conversation summarized]\n${summary}` },
    ]
    this.used = estimateMessageTokens(this.msgs)
  }
}
