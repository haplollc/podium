import type { ChatMessage } from '@podium/providers'
import { estimateMessageTokens } from './tokens.js'
import type { ContextStats } from './types.js'

export interface ContextOpts { window: number; outputReserve: number }

export class ContextManager {
  private msgs: ChatMessage[] = []
  constructor(private opts: ContextOpts) {}

  add(m: ChatMessage): void { this.msgs.push(m) }
  messages(): ChatMessage[] { return this.msgs }

  stats(): ContextStats {
    const used = estimateMessageTokens(this.msgs)
    const effective = this.opts.window - this.opts.outputReserve
    return {
      used,
      effective,
      window: this.opts.window,
      percentUsed: effective > 0 ? used / effective : 1,
    }
  }

  /** Keep the first `prefixCount` messages, replace the rest with one summary. */
  replaceWithSummary(summary: string, prefixCount: number): void {
    const prefix = this.msgs.slice(0, prefixCount)
    this.msgs = [
      ...prefix,
      { role: 'user', content: `[Earlier conversation summarized]\n${summary}` },
    ]
  }
}
